/**
 * Checagem do motor de regras do funil.
 *
 * É a regra que transforma uma etiqueta no celular do atendente em conversão
 * enviada ao Google Ads. Um falso positivo aqui manda venda que não existiu e
 * ensina o algoritmo do cliente a gastar no lugar errado.
 */
import { avaliarConversa, contarTrocasCompletas, foiMarcadaComoPerdida, valorDaVenda } from "../src/lib/track/rules";
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
  trocasCompletas: 0,
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

console.log("qualificado por engajamento (alternância real)");
{
  const cfgEng: TrackConfig = { ...cfg, qualifiedMinTrocas: 3 };
  const est = (trocas: number, inb = trocas + 1, out = trocas) => ({
    stage: "respondeu" as const, inboundCount: inb, outboundCount: out,
    trocasCompletas: trocas,
    labelIds: [] as string[], houveOutboundAntesDoUltimoInbound: true,
  });

  // 3 idas e voltas completas: é conversa de verdade.
  ok("3 trocas qualificam sozinho", avaliarConversa(cfgEng, est(3))?.stage, "qualificado");
  ok("origem é a contagem de mensagens", avaliarConversa(cfgEng, est(3))?.origem, "messages");
  verdade("o detalhe explica o porquê", Boolean(avaliarConversa(cfgEng, est(3))?.detalhe?.includes("idas e voltas")));
  ok("4 trocas também", avaliarConversa(cfgEng, est(4))?.stage, "qualificado");
  ok("2 trocas ainda não", avaliarConversa(cfgEng, est(2)), null);

  // Desligado volta ao comportamento anterior: só marca à mão.
  const desligado: TrackConfig = { ...cfg, qualifiedMinTrocas: 0 };
  ok("com 0 fica desligado", avaliarConversa(desligado, est(10)), null);
  ok("mas a etiqueta continua valendo", avaliarConversa(desligado, { ...est(1), labelIds: ["10"] })?.stage, "qualificado");

  // Venda continua ganhando de qualificado.
  ok(
    "venda tem precedência sobre engajamento",
    avaliarConversa(cfgEng, { ...est(5), labelIds: ["20"] })?.stage,
    "venda",
  );
  // E não volta atrás depois de vendido.
  ok("já vendido não vira qualificado por conversa", avaliarConversa(cfgEng, { ...est(9), stage: "venda" }), null);
}

console.log("contagem de trocas (a alternância em si)");
{
  const t = (seq: string) => contarTrocasCompletas([...seq].map((c) => (c === "I" ? "in" : "out")));

  // O caso que motivou a mudança: cliente mandou 3 e sumiu, atendente mandou
  // 3 cobranças no vácuo. min(3,3) diria "qualificado"; a alternância diz 0.
  ok("monólogo dos dois lados NÃO conta", t("IIIOOO"), 0);
  ok("cliente falando sozinho é 0", t("IIIIIIII"), 0);
  ok("atendente cobrando no vácuo é 0", t("IOOOOO"), 0);

  // Conversa de verdade: o cliente VOLTA depois da resposta.
  ok("I-O-I é 1 troca", t("IOI"), 1);
  ok("I-O-I-O-I é 2 trocas", t("IOIOI"), 2);
  ok("I-O-I-O-I-O-I é 3 trocas", t("IOIOIOI"), 3);
  // Rajada colapsa: 3 mensagens seguidas do cliente = 1 bloco.
  ok("rajadas colapsam", t("IIIOOIIOI"), 2);
  // Atendente terminando a conversa não conta como troca.
  ok("resposta final sem retorno não conta", t("IOIO"), 1);
  ok("vazio é 0", t(""), 0);
  // Conversa iniciada pelo atendente (raro, mas possível).
  ok("O-I conta como 1 (cliente respondeu)", t("OI"), 1);
}

console.log(`
${total - falhas}/${total} checagens passaram`);
if (falhas > 0) {
  console.error(`${falhas} FALHA(S)`);
  process.exit(1);
}
console.log("TUDO CERTO");
