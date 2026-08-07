/**
 * Checagem do motor de regras do funil.
 *
 * É a regra que transforma uma etiqueta no celular do atendente em conversão
 * enviada ao Google Ads. Um falso positivo aqui manda venda que não existiu e
 * ensina o algoritmo do cliente a gastar no lugar errado.
 */
import { avaliarConversa, foiMarcadaComoPerdida, valorDaVenda } from "../src/lib/track/rules";
import { CONFIG_PADRAO, type TrackConfig } from "../src/lib/track/settings";

let falhas = 0;
let total = 0;

function verdade(nome: string, cond: boolean) {
  total++;
  if (!cond) {
    falhas++;
    console.error(`  FALHOU ${nome}`);
  }
}

function ok(nome: string, real: unknown, esperado: unknown) {
  total++;
  if (JSON.stringify(real) !== JSON.stringify(esperado)) {
    falhas++;
    console.error(`  FALHOU ${nome}\n    esperado: ${JSON.stringify(esperado)}\n    veio:     ${JSON.stringify(real)}`);
  }
}

const cfg: TrackConfig = {
  ...CONFIG_PADRAO,
  qualifiedLabelIds: ["10"],
  saleLabelIds: ["20"],
  lostLabelIds: ["30"],
  qualifiedPhrases: [{ text: "quanto custa", direction: "in" }],
  salePhrases: [{ text: "parabéns pela sua compra", direction: "out" }],
  defaultSaleValue: 300,
};

const base = {
  stage: "lead" as const,
  inboundCount: 1,
  outboundCount: 0,
  labelIds: [] as string[],
  houveOutboundAntesDoUltimoInbound: false,
};

console.log("etiquetas");
{
  ok("etiqueta de venda vira venda", avaliarConversa(cfg, { ...base, labelIds: ["20"] })?.stage, "venda");
  ok("origem é a etiqueta", avaliarConversa(cfg, { ...base, labelIds: ["20"] })?.origem, "label");
  ok("detalhe traz o id da etiqueta", avaliarConversa(cfg, { ...base, labelIds: ["20"] })?.detalhe, "20");
  ok("etiqueta de qualificação", avaliarConversa(cfg, { ...base, labelIds: ["10"] })?.stage, "qualificado");
  // Etiqueta que o cliente usa para outra coisa não pode virar venda.
  ok("etiqueta desconhecida não faz nada", avaliarConversa(cfg, { ...base, labelIds: ["77"] }), null);
  // Venda ganha de qualificado quando as duas estão na conversa.
  ok("venda tem precedência", avaliarConversa(cfg, { ...base, labelIds: ["10", "20"] })?.stage, "venda");
  // O funil não anda para trás: conversão enviada não se des-envia.
  ok("já vendido não volta pra qualificado", avaliarConversa(cfg, { ...base, stage: "venda", labelIds: ["10"] }), null);
  ok("já vendido não repete venda", avaliarConversa(cfg, { ...base, stage: "venda", labelIds: ["20"] }), null);
}

console.log("frases-gatilho");
{
  const vendaOut = avaliarConversa(cfg, base, { texto: "Parabéns pela sua compra!", direcao: "out" });
  ok("frase do atendente fecha venda", vendaOut?.stage, "venda");
  ok("origem é a frase", vendaOut?.origem, "phrase");

  // A direção é o que impede o atendente de qualificar o lead sozinho.
  ok(
    "a MESMA frase vinda do cliente não conta",
    avaliarConversa(cfg, base, { texto: "parabéns pela sua compra", direcao: "in" }),
    null,
  );
  ok(
    "pergunta do cliente qualifica",
    avaliarConversa(cfg, base, { texto: "Oi, quanto custa o tratamento?", direcao: "in" })?.stage,
    "qualificado",
  );
  ok(
    "a mesma pergunta feita pelo atendente não qualifica",
    avaliarConversa(cfg, base, { texto: "quanto custa pra você hoje?", direcao: "out" }),
    null,
  );

  // Acento, caixa e pontuação não podem quebrar a regra.
  ok(
    "casa sem acento",
    avaliarConversa(cfg, base, { texto: "PARABENS PELA SUA COMPRA", direcao: "out" })?.stage,
    "venda",
  );
  ok(
    "casa no meio de um texto maior",
    avaliarConversa(cfg, base, { texto: "Show! Parabéns pela sua compra, já vou separar", direcao: "out" })?.stage,
    "venda",
  );
  ok("mensagem sem texto não dispara", avaliarConversa(cfg, base, { texto: null, direcao: "out" }), null);
  ok("texto qualquer não dispara", avaliarConversa(cfg, base, { texto: "bom dia", direcao: "out" }), null);
}

console.log("estágio respondeu");
{
  // "Respondeu" separa lead que existe de lead que engajou. É o número que o
  // cliente quer mandar ao Google no lugar do volume bruto.
  ok(
    "duas entradas com resposta no meio",
    avaliarConversa(cfg, { ...base, inboundCount: 2, outboundCount: 1, houveOutboundAntesDoUltimoInbound: true })?.stage,
    "respondeu",
  );
  ok(
    "lead falando sozinho não conta",
    avaliarConversa(cfg, { ...base, inboundCount: 5, outboundCount: 0, houveOutboundAntesDoUltimoInbound: false }),
    null,
  );
  ok(
    "uma entrada só não conta",
    avaliarConversa(cfg, { ...base, inboundCount: 1, outboundCount: 1, houveOutboundAntesDoUltimoInbound: true }),
    null,
  );
  // Quem não quer exigir resposta do atendente pode desligar.
  const semExigir: TrackConfig = { ...cfg, respondedRequiresOutbound: false };
  ok(
    "sem exigir resposta, duas entradas bastam",
    avaliarConversa(semExigir, { ...base, inboundCount: 2, houveOutboundAntesDoUltimoInbound: false })?.stage,
    "respondeu",
  );
  ok("origem é a contagem", avaliarConversa(semExigir, { ...base, inboundCount: 2 })?.origem, "messages");
}

console.log("perdido e valor");
{
  ok("etiqueta de perdido é detectada", foiMarcadaComoPerdida(cfg, ["30"]), "30");
  ok("sem etiqueta de perdido", foiMarcadaComoPerdida(cfg, ["10"]), null);
  // Perdido é estado, não etapa: não entra no funil nem gera conversão.
  ok("perdido não aparece como estágio", avaliarConversa(cfg, { ...base, labelIds: ["30"] }), null);
  // Conversa perdida pode ser reaberta se a pessoa voltar e fechar.
  ok(
    "conversa perdida pode virar venda depois",
    avaliarConversa(cfg, { ...base, stage: "perdido", labelIds: ["20"] })?.stage,
    "venda",
  );

  ok("usa o valor informado", valorDaVenda(cfg, 850), 850);
  ok("cai no padrão do workspace", valorDaVenda(cfg, null), 300);
  ok("valor zero é válido", valorDaVenda(cfg, 0), 0);
  ok("valor negativo cai no padrão", valorDaVenda(cfg, -5), 300);
  // Sem valor definido, sobe sem valor: melhor que inventar um número.
  ok("sem padrão fica nulo", valorDaVenda({ ...cfg, defaultSaleValue: null }, null), null);
}

console.log("workspace sem configuração");
{
  // Cliente que ainda não configurou etiqueta nenhuma não pode ter venda
  // detectada por acidente.
  const vazio = CONFIG_PADRAO;
  ok("nenhuma etiqueta configurada", avaliarConversa(vazio, { ...base, labelIds: ["20"] }), null);
  ok("nenhuma frase configurada", avaliarConversa(vazio, base, { texto: "parabéns pela sua compra", direcao: "out" }), null);
  // Mas o "respondeu" funciona sem configuração, com os defaults.
  ok(
    "respondeu funciona sem configurar nada",
    avaliarConversa(vazio, { ...base, inboundCount: 2, houveOutboundAntesDoUltimoInbound: true })?.stage,
    "respondeu",
  );
}

console.log(`\n${total - falhas}/${total} checagens passaram`);
if (falhas > 0) {
  console.error(`${falhas} FALHA(S)`);
  process.exit(1);
}
console.log("TUDO CERTO");
