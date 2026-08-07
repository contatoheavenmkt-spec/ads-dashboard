/**
 * Checagem da resolução de identidade do contato.
 *
 * Este arquivo existe por causa de um bug real: o handler de etiqueta resolvia
 * o contato de um jeito e o de mensagem de outro, então em conta Business (a
 * ÚNICA que tem etiqueta) a etiqueta "Pago" nunca achava a conversa. O produto
 * falhava calado no caso de uso principal, e a suíte ficava verde porque o
 * ensaio escrevia a etiqueta direto no banco, pulando o caminho real.
 *
 * A regra que estes testes protegem: mensagem e etiqueta TÊM que chegar à
 * mesma conversa.
 */
import {
  candidatosParaEtiqueta,
  memorizarLid,
  pareceTelefone,
  resolverContatoDaMensagem,
  telefoneDoLid,
} from "../worker/pipeline/contatos";

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

const INST = "inst-1";
const LID = "185432109876543@lid";
const PN = "5511987654321@s.whatsapp.net";
const CHAVE_PN = "551187654321"; // canônica, sem o nono dígito

console.log("o que parece telefone");
{
  verdade("celular BR de 13 dígitos", pareceTelefone("5511987654321"));
  verdade("celular BR de 12 dígitos", pareceTelefone("551187654321"));
  verdade("número dos EUA", pareceTelefone("12025550123"));
  // Um @lid tem 14 a 16 dígitos e não é telefone nenhum.
  verdade("lid de 15 dígitos NÃO é telefone", !pareceTelefone("185432109876543"));
  verdade("lid de 14 dígitos NÃO é telefone", !pareceTelefone("18543210987654"));
  verdade("curto demais não é telefone", !pareceTelefone("12345"));
  verdade("texto não é telefone", !pareceTelefone("abc123"));
}

console.log("mensagem de conta Business (endereçada por lid)");
{
  // O Baileys manda o lid no remoteJid e o telefone real no remoteJidAlt.
  const r = resolverContatoDaMensagem(INST, LID, PN);
  ok("usa o telefone real como chave", r?.contactKey, CHAVE_PN);
  ok("guarda o lid na coluna própria", r?.lidKey, LID);
  verdade("marca que é telefone de verdade", r?.ehTelefoneReal === true);
  // E memoriza, para quando vier evento sem o alt.
  ok("memorizou o mapeamento", telefoneDoLid(INST, LID), CHAVE_PN);
}

console.log("mensagem sem o telefone real");
{
  const OUTRO_LID = "199999999999999@lid";
  const r = resolverContatoDaMensagem(INST, OUTRO_LID, null);
  ok("usa os dígitos do lid como chave provisória", r?.contactKey, "199999999999999");
  ok("guarda o lid", r?.lidKey, OUTRO_LID);
  // Isso é o sinal de que a chave ainda não é um telefone.
  verdade("marca que NÃO é telefone real", r?.ehTelefoneReal === false);
}

console.log("mensagem comum (endereçada por telefone)");
{
  const r = resolverContatoDaMensagem(INST, PN, null);
  ok("chave canônica", r?.contactKey, CHAVE_PN);
  ok("sem lid", r?.lidKey, null);
  verdade("é telefone real", r?.ehTelefoneReal === true);

  // As duas formas do mesmo celular convergem.
  const semNono = resolverContatoDaMensagem(INST, "551187654321@s.whatsapp.net", null);
  ok("versão sem o nono dígito dá a mesma chave", semNono?.contactKey, CHAVE_PN);
}

console.log("etiqueta em conta Business (o bug que motivou este arquivo)");
{
  // A etiqueta traz SÓ o chatId, que vem como @lid. A conversa foi gravada
  // com o telefone real. Sem o mapeamento, a busca não acharia nada.
  const { chaves, lidJid } = candidatosParaEtiqueta(INST, LID);
  verdade("procura pelo telefone aprendido", chaves.includes(CHAVE_PN), `(chaves: ${chaves.join(", ")})`);
  verdade("procura também pelos dígitos do lid", chaves.includes("185432109876543"));
  ok("devolve o lid para casar pela coluna lidKey", lidJid, LID);

  // O caminho que estava quebrado: a conversa gravada pela mensagem TEM que
  // ser encontrada pela etiqueta.
  const daMensagem = resolverContatoDaMensagem(INST, LID, PN);
  verdade(
    "a chave gravada pela mensagem está entre as procuradas pela etiqueta",
    chaves.includes(daMensagem!.contactKey),
    `(gravou "${daMensagem!.contactKey}", procura ${JSON.stringify(chaves)})`,
  );
}

console.log("etiqueta num lid nunca visto");
{
  const NOVO = "177777777777777@lid";
  const { chaves, lidJid } = candidatosParaEtiqueta(INST, NOVO);
  // Sem mapeamento aprendido, sobra o próprio lid, que é como a conversa
  // teria sido gravada nesse caso.
  ok("usa os dígitos do lid", chaves, ["177777777777777"]);
  ok("e o lid para a coluna", lidJid, NOVO);
}

console.log("etiqueta em chat por telefone");
{
  const { chaves, lidJid } = candidatosParaEtiqueta(INST, PN);
  ok("chave canônica", chaves, [CHAVE_PN]);
  ok("sem lid", lidJid, null);
}

console.log("isolamento entre instâncias");
{
  // O mesmo lid em duas instâncias diferentes não pode se confundir: seriam
  // clientes distintos da agência.
  const OUTRA = "inst-2";
  memorizarLid(OUTRA, LID, "5521999998888");
  ok("instância 1 mantém o seu", telefoneDoLid(INST, LID), CHAVE_PN);
  ok("instância 2 tem o seu", telefoneDoLid(OUTRA, LID), "5521999998888");
  verdade("não vazam entre si", telefoneDoLid(INST, LID) !== telefoneDoLid(OUTRA, LID));
}

console.log("entradas inválidas");
{
  ok("jid vazio", resolverContatoDaMensagem(INST, "", null), null);
  ok("candidatos de chatId vazio", candidatosParaEtiqueta(INST, "").chaves, []);
}

console.log(`\n${total - falhas}/${total} checagens passaram`);
if (falhas > 0) {
  console.error(`${falhas} FALHA(S)`);
  process.exit(1);
}
console.log("TUDO CERTO");
