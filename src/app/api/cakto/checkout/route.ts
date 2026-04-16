import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { buildCheckoutUrl } from "@/lib/cakto";
import { type PlanKey } from "@/lib/plans";

const VALID_PLANS: PlanKey[] = ["start", "plus", "premium"];

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json() as { plan?: string };
    const { plan } = body;

    if (!plan || !VALID_PLANS.includes(plan as PlanKey)) {
      return NextResponse.json(
        { error: "Plano inválido. Escolha: start, plus ou premium." },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const url = buildCheckoutUrl(plan, user.id, user.email, user.name);
    console.log(`[cakto/checkout] plan=${plan} userId=${user.id} → ${url}`);

    return NextResponse.json({ url });
  } catch (err: any) {
    console.error("[cakto/checkout] Erro:", err.message);
    return NextResponse.json(
      { error: err.message ?? "Erro interno ao gerar link de pagamento." },
      { status: 500 }
    );
  }
}
