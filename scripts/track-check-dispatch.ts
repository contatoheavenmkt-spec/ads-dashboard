/**
 * Checagem do envio de conversão para o Google Ads.
 *
 * Duas coisas aqui quebram em silêncio e custam caro:
 * o formato do instante (o Google recusa a conversão inteira se estiver
 * errado) e a classificação de erro (tratar permanente como transitório faz o
 * cron bater à toa para sempre; o contrário descarta venda boa).
 */
import {
  classificarErroDeConversao,
  formatConversionDateTime,
} from "../src/lib/google-ads";

let falhas = 0;
let total = 0;

function ok(nome: string, real: unknown, esperado: unknown) {
  total++;
  if (JSON.stringify(real) !== JSON.stringify(esperado)) {
    falhas++;
    console.error(`  FALHOU ${nome}\n    esperado: ${JSON.stringify(esperado)}\n    veio:     ${JSON.stringify(real)}`);
  }
}

function verdade(nome: string, cond: boolean, detalhe = "") {
  total++;
  if (!cond) {
    falhas++;
    console.error(`  FALHOU ${nome} ${detalhe}`);
  }
}

console.log("formato do instante da conversão");
{
  // O Google exige "yyyy-MM-dd HH:mm:ss+HH:mm". Sem o deslocamento explícito
  // ele interpreta no fuso da conta, e a conversão pode cair antes do clique.
  const formato = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

  const meioDiaUtc = new Date("2026-08-07T15:30:00.000Z");
  const s = formatConversionDateTime(meioDiaUtc);
  verdade("bate o formato exigido", formato.test(s), `(${s})`);
  // São Paulo é UTC-3: 15:30Z vira 12:30 local.
  ok("converte para o fuso de São Paulo", s, "2026-08-07 12:30:00-03:00");

  // Virada do dia: 02:00Z do dia 8 é 23:00 do dia 7 em São Paulo.
  const viradaDia = new Date("2026-08-08T02:00:00.000Z");
  ok("data recua na virada do dia", formatConversionDateTime(viradaDia), "2026-08-07 23:00:00-03:00");

  // Meia-noite exata: alguns runtimes devolvem "24" em vez de "00".
  const meiaNoite = new Date("2026-08-08T03:00:00.000Z");
  const sm = formatConversionDateTime(meiaNoite);
  verdade("meia-noite não vira hora 24", !sm.includes(" 24:"), `(${sm})`);
  ok("meia-noite formatada certa", sm, "2026-08-08 00:00:00-03:00");

  // Outro fuso continua funcionando (cliente fora do Brasil).
  const ny = formatConversionDateTime(meioDiaUtc, "America/New_York");
  verdade("outro fuso mantém o formato", formato.test(ny), `(${ny})`);
  verdade("Nova York não é -03:00", !ny.endsWith("-03:00"), `(${ny})`);

  // O instante formatado nunca pode ser anterior ao clique quando o evento é
  // posterior: é o erro CONVERSION_PRECEDES_CLICK.
  const clique = new Date("2026-08-07T10:00:00.000Z");
  const venda = new Date("2026-08-07T14:00:00.000Z");
  verdade(
    "evento depois do clique continua depois depois de formatado",
    formatConversionDateTime(venda) > formatConversionDateTime(clique),
  );
}

console.log("classificação de erro");
{
  // Sucesso disfarçado de erro: o Google já tinha a conversão, então deu certo.
  // Tratar isso como falha faria o cron reenviar para sempre.
  ok("orderId duplicado é sucesso", classificarErroDeConversao("DUPLICATE_ORDER_ID"), "sucesso");

  // Permanentes: insistir nunca vai adiantar.
  ok("gclid expirado é permanente", classificarErroDeConversao("EXPIRED_GCLID"), "permanente");
  ok("tipo de ação errado é permanente", classificarErroDeConversao("INVALID_CONVERSION_ACTION_TYPE"), "permanente");
  ok("ação inexistente é permanente", classificarErroDeConversao("NO_CONVERSION_ACTION_FOUND"), "permanente");
  ok("conversão antes do clique é permanente", classificarErroDeConversao("CONVERSION_PRECEDES_EVENT"), "permanente");
  ok("gclid ilegível é permanente", classificarErroDeConversao("UNPARSEABLE_GCLID"), "permanente");
  ok("conta inválida é permanente", classificarErroDeConversao("INVALID_CUSTOMER_ID"), "permanente");

  // Transitórios: vale tentar de novo.
  ok("erro interno é transitório", classificarErroDeConversao("INTERNAL_ERROR"), "transitorio");
  ok("cota estourada é transitória", classificarErroDeConversao("RESOURCE_EXHAUSTED"), "transitorio");
  // Este é o caso especial: costuma ser só o Google ainda não ter processado
  // o clique. Desistir na primeira tentativa perderia venda de verdade.
  ok("clique não encontrado é transitório", classificarErroDeConversao("CLICK_NOT_FOUND"), "transitorio");
  // Código desconhecido é tratado como transitório: melhor tentar de novo do
  // que descartar uma venda por um código que ainda não mapeamos.
  ok("código desconhecido é transitório", classificarErroDeConversao("ALGO_QUE_NAO_MAPEAMOS"), "transitorio");
}

console.log(`\n${total - falhas}/${total} checagens passaram`);
if (falhas > 0) {
  console.error(`${falhas} FALHA(S)`);
  process.exit(1);
}
console.log("TUDO CERTO");
