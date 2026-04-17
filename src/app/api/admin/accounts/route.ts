import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  if (!validateAdminRequest(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const plan = searchParams.get("plan") ?? "";
  const status = searchParams.get("status") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const where: any = { role: { not: undefined } };

  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }

  if (plan) {
    where.subscription = { plan };
  }

  if (status) {
    where.subscription = { ...(where.subscription ?? {}), status };
  }

  try {
    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        include: {
          subscription: true,
          _count: { select: { metaConnections: true, googleConnections: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({ users, total, limit, offset });
  } catch (err: any) {
    console.error("[admin/accounts/GET] Erro:", err?.message ?? err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
