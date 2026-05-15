import { NextResponse } from "next/server";

/**
 * Endpoint AbacatePay descontinuado.
 *
 * Motivação: o app não tem nenhuma rota que crie cobranças AbacatePay
 * (toda a integração de pagamento vai por Stripe ou Cakto). O webhook
 * ficou exposto como "qualquer um com o secret manda billing.metadata.userId
 * e plan arbitrários → ativa plano" — risco alto sem ganho funcional.
 *
 * Se a integração AbacatePay voltar a ser usada no futuro, deve:
 *   1. existir um endpoint server-side que crie a cobrança e registre
 *      localmente (billing.id → userId/plan esperados)
 *   2. o webhook validar billing.id contra essa tabela, em vez de confiar
 *      em metadata vinda no payload.
 */
export async function POST() {
  return NextResponse.json(
    { error: "AbacatePay webhook descontinuado" },
    { status: 410 },
  );
}
