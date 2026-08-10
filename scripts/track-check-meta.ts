/**
 * Checagem do envio de conversão para o Meta.
 *
 * Espelha o que scripts/track-check-dispatch.ts faz do lado do Google. O que
 * quebra em silêncio aqui é a classificação de erro: tratar token inválido
 * como transitório faz o cron bater à toa para sempre, e o contrário descarta
 * venda boa por um soluço de rede.
 */
import { classificarErroCapi, EVENTO_PADRAO, EVENTOS_META } from "../src/lib/meta-capi";

let falhas = 0;
let total = 0;

function ok(nome: string, real: unknown, esperado: unknown) {
  total++;
  if (JSON.stringify(real) !== JSON.stringify(esperado)) {
    falhas++;
    console.error(`  FALHOU ${nome}\n    esperado: ${JSON.stringify(esperado)}\n    veio:     ${JSON.stringify(real)}`);
  }
}

function verdade(nome: string, cond: boolean) {
  total++;
  if (!cond) { falhas++; console.error(`  FALHOU ${nome}`); }
}

console.log("classificação de erro do Meta");
{
  // Permanentes: insistir nunca vai passar, e cada tentativa gasta cota.
  ok("token inválido é permanente", classificarErroCapi("190"), "permanente");
  ok("sem permissão no dataset é permanente", classificarErroCapi("200"), "permanente");
  ok("parâmetro inválido é permanente", classificarErroCapi("100"), "permanente");
  ok("objeto inexistente é permanente", classificarErroCapi("803"), "permanente");
  // OAuthException é sempre problema de credencial, qualquer que seja o código.
  ok("OAuthException é permanente", classificarErroCapi("999", "OAuthException"), "permanente");

  // Transitórios: vale tentar de novo.
  ok("erro desconhecido é transitório", classificarErroCapi("1"), "transitorio");
  ok("erro temporário é transitório", classificarErroCapi("2"), "transitorio");
  ok("limite de chamadas é transitório", classificarErroCapi("4"), "transitorio");
  ok("limite de usuário é transitório", classificarErroCapi("17"), "transitorio");
  // Código não mapeado tenta de novo: descartar venda boa é pior.
  ok("código novo é transitório", classificarErroCapi("55555"), "transitorio");
}

console.log("mapeamento de evento por estágio");
{
  ok("venda vira Purchase", EVENTO_PADRAO.venda, "Purchase");
  ok("qualificado vira Lead", EVENTO_PADRAO.qualificado, "Lead");
  ok("respondeu vira Contact", EVENTO_PADRAO.respondeu, "Contact");
  verdade("Purchase está na lista de eventos", EVENTOS_META.includes("Purchase"));
  verdade("todos os padrões são eventos conhecidos",
    Object.values(EVENTO_PADRAO).every((e) => (EVENTOS_META as readonly string[]).includes(e)));
}

console.log(`\n${total - falhas}/${total} checagens passaram`);
if (falhas > 0) { console.error(`${falhas} FALHA(S)`); process.exit(1); }
console.log("TUDO CERTO");
