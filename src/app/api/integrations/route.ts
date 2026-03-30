import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const integrations = await db.integration.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(integrations);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { adAccountId, name, bmId, bmName, platform } = body as {
    adAccountId: string;
    name: string;
    bmId?: string;
    bmName?: string;
    platform: string;
  };

  if (!adAccountId || !name || !platform) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }

  const existing = await db.integration.findFirst({
    where: { adAccountId },
  });

  if (existing) {
    return NextResponse.json({ error: "Conta já conectada" }, { status: 409 });
  }

  const integration = await db.integration.create({
    data: {
      platform,
      adAccountId,
      name,
      bmId: bmId ?? null,
      bmName: bmName ?? null,
      accessToken: process.env.META_ACCESS_TOKEN ?? "",
      status: "active",
    },
  });

  return NextResponse.json(integration, { status: 201 });
}
