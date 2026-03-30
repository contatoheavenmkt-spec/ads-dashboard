import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";

export async function GET() {
  const workspaces = await db.workspace.findMany({
    include: {
      integrations: { include: { integration: true } },
      clients: { select: { id: true, email: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(workspaces);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, logo, integrationIds } = body;

  if (!name) {
    return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  }

  const baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 1;

  while (await db.workspace.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter++}`;
  }

  const workspace = await db.workspace.create({
    data: {
      name,
      slug,
      logo: logo ?? null,
      integrations: integrationIds?.length
        ? {
            create: (integrationIds as string[]).map((id: string) => ({
              integrationId: id,
            })),
          }
        : undefined,
    },
    include: {
      integrations: { include: { integration: true } },
    },
  });

  return NextResponse.json(workspace, { status: 201 });
}
