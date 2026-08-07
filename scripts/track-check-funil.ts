/**
 * Checagem das regras de funil e da configuração do Track.
 *
 * Complementa scripts/track-check.ts. Aqui mora a lógica que decide se um
 * lead virou venda: errar isso significa mandar conversão errada para o
 * Google Ads e treinar o algoritmo do cliente contra ele mesmo.
 */
import {
  STAGES,
  avancou,
  confiancaDoMatch,
  isStage,
  ordemDoStage,
  stagesImplicados,
} from "../src/lib/track/stages";
import {
  CONFIG_PADRAO,
  normalizarTexto,
  parseTrackSettings,
  serializeTrackSettings,
  type TrackSettingsRow,
} from "../src/lib/track/settings";

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
  if (!cond) {
    falhas++;
    console.error(`  FALHOU ${nome}`);
  }
}

console.log("stages.ts");
{
  ok("ordem do funil", [...STAGES], ["lead", "respondeu", "qualificado", "venda"]);
  verdade("reconhece estágio válido", isStage("venda"));
  verdade("rejeita estágio inventado", !isStage("faturado"));
  verdade("perdido não é estágio de funil", !isStage("perdido"));

  verdade("lead avança para respondeu", avancou("lead", "respondeu"));
  verdade("respondeu avança para venda", avancou("respondeu", "venda"));
  // O funil só anda para frente: etiqueta removida no celular não desfaz
  // venda já contabilizada, porque conversão enviada não se des-envia.
  verdade("venda não volta para qualificado", !avancou("venda", "qualificado"));
  verdade("não repete o mesmo estágio", !avancou("qualificado", "qualificado"));
  verdade("conversa perdida pode ser reaberta", avancou("perdido", "qualificado"));

  // Sem isso o painel mostraria "1 venda, 0 qualificados" e ninguém confia no funil.
  ok("venda implica os anteriores", stagesImplicados("venda"), ["lead", "respondeu", "qualificado", "venda"]);
  ok("qualificado implica os anteriores", stagesImplicados("qualificado"), ["lead", "respondeu", "qualificado"]);
  ok("lead implica só ele", stagesImplicados("lead"), ["lead"]);
  verdade("ordem é estritamente crescente", ordemDoStage("lead") < ordemDoStage("venda"));

  ok("código é alta confiança", confiancaDoMatch("code"), "high");
  ok("ctwa é alta confiança", confiancaDoMatch("ctwa"), "high");
  // Proximidade é palpite: a conversa chegou perto de um clique sem dono, mas
  // ninguém provou que é a mesma pessoa.
  ok("proximidade é baixa confiança", confiancaDoMatch("proximity"), "low");
  ok("sem match é sem confiança", confiancaDoMatch("none"), "none");
}

console.log("settings.ts");
{
  ok("sem linha no banco usa os defaults", parseTrackSettings(null), CONFIG_PADRAO);

  const row: TrackSettingsRow = {
    respondedMinInbound: 3,
    respondedRequiresOutbound: false,
    qualifiedLabelIds: JSON.stringify(["12", "7"]),
    qualifiedPhrases: JSON.stringify([{ text: "quanto custa", direction: "in" }]),
    saleLabelIds: JSON.stringify(["3"]),
    salePhrases: JSON.stringify([{ text: "parabéns pela sua compra", direction: "out" }]),
    lostLabelIds: null,
    defaultSaleValue: 250,
    syncCrmSale: true,
    createLeadInCrm: false,
    storeMessageText: false,
    messageRetentionDays: 30,
    journeyResetDays: 45,
    matchWindowMinutes: 15,
    uploadLagHours: 6,
    timezone: "America/Sao_Paulo",
  };
  const cfg = parseTrackSettings(row);
  ok("lê etiquetas de venda", cfg.saleLabelIds, ["3"]);
  ok("lê frase com direção", cfg.salePhrases, [{ text: "parabéns pela sua compra", direction: "out" }]);
  ok("lista ausente vira vazia", cfg.lostLabelIds, []);
  ok("respeita opt-out de guardar texto", cfg.storeMessageText, false);

  // JSON corrompido não pode derrubar o worker no meio de uma conversa.
  const quebrado = { ...row, saleLabelIds: "{isso não é json", salePhrases: "null" };
  const cfgQ = parseTrackSettings(quebrado);
  ok("JSON inválido vira lista vazia", cfgQ.saleLabelIds, []);
  ok("JSON null vira lista vazia", cfgQ.salePhrases, []);

  // Formato antigo (string solta em vez de objeto) precisa continuar lendo.
  const legado = { ...row, salePhrases: JSON.stringify(["fechado"]) };
  ok("frase em formato antigo vira any", parseTrackSettings(legado).salePhrases, [
    { text: "fechado", direction: "any" },
  ]);

  // Frase curta demais casaria com qualquer coisa e marcaria venda sozinha.
  const curta = { ...row, salePhrases: JSON.stringify([{ text: "ok", direction: "out" }]) };
  ok("frase curta demais é descartada", parseTrackSettings(curta).salePhrases, []);

  verdade("mínimo de inbound nunca é zero", parseTrackSettings({ ...row, respondedMinInbound: 0 }).respondedMinInbound >= 1);

  const s = serializeTrackSettings({ saleLabelIds: ["9"], defaultSaleValue: 100 });
  ok("serializa lista como JSON", s.saleLabelIds, '["9"]');
  ok("serializa número direto", s.defaultSaleValue, 100);
  ok("não escreve campo não informado", Object.keys(s).sort(), ["defaultSaleValue", "saleLabelIds"]);

  // Ida e volta tem que preservar tudo.
  const original = { ...CONFIG_PADRAO, saleLabelIds: ["1", "2"], qualifiedPhrases: [{ text: "tenho interesse", direction: "in" as const }] };
  const roundtrip = parseTrackSettings(serializeTrackSettings(original) as unknown as TrackSettingsRow);
  ok("ida e volta preserva etiquetas", roundtrip.saleLabelIds, ["1", "2"]);
  ok("ida e volta preserva frases", roundtrip.qualifiedPhrases, original.qualifiedPhrases);

  // O ponto que faz a etiqueta funcionar de verdade: o atendente escreve com
  // acento, maiúscula e pontuação; a regra cadastrada é texto simples.
  ok("tira acento e caixa", normalizarTexto("Parabéns Pela Sua COMPRA!"), "parabens pela sua compra!");
  ok("colapsa espaços", normalizarTexto("  muito    obrigado  "), "muito obrigado");
  ok("cedilha e til", normalizarTexto("Confirmação de Inscrição"), "confirmacao de inscricao");
  verdade(
    "frase do atendente casa com a regra cadastrada",
    normalizarTexto("Parabéns pela sua compra! 🎉").includes(normalizarTexto("parabens pela sua compra")),
  );
}

console.log(`\n${total - falhas}/${total} checagens passaram`);
if (falhas > 0) {
  console.error(`${falhas} FALHA(S)`);
  process.exit(1);
}
console.log("TUDO CERTO");
