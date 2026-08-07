/**
 * Checagem das funções puras do Track.
 *
 * O projeto não tem framework de teste, mas code.ts e phone.ts concentram a
 * lógica condicional do módulo e quebram em silêncio: um código que não casa
 * vira lead sem atribuição, e um telefone normalizado errado vira contato
 * duplicado. Rodar `npx tsx scripts/track-check.ts` cobre esses dois.
 */
import {
  CODE_LENGTH,
  extractCode,
  formatCode,
  generateCode,
  generateSlug,
  isValidCode,
  renderMessage,
} from "../src/lib/track/code";
import {
  canonicalPhoneKey,
  formatPhoneDisplay,
  isBrazilMobile,
  isGroupJid,
  isLidJid,
  maskPhone,
  normalizePhone,
  phoneFromJid,
  contactKeyFromJid,
} from "../src/lib/track/phone";

let falhas = 0;
let total = 0;

function ok(nome: string, real: unknown, esperado: unknown) {
  total++;
  const bateu = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bateu) {
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

console.log("code.ts");
{
  const c = generateCode();
  verdade("gera código no tamanho certo", c.length === CODE_LENGTH);
  verdade("código gerado é válido", isValidCode(c));
  verdade("não usa caracteres ambíguos (0 O 1 I L)", !/[01OIL]/.test(c));

  // Sem repetição em 5 mil gerações: prova na prática que não vamos colidir
  // no volume de um cliente.
  const vistos = new Set<string>();
  for (let i = 0; i < 5000; i++) vistos.add(generateCode());
  ok("5000 códigos sem colisão", vistos.size, 5000);

  ok("extrai do texto padrão", extractCode(`Olá! Vim pelo anúncio. Código ${formatCode("A2B3C4D5")}`), "A2B3C4D5");
  ok("extrai com texto antes e depois", extractCode("oi tudo bem #A2B3C4D5 quero saber o preço"), "A2B3C4D5");
  ok("extrai mesmo em minúsculo", extractCode("vim pelo anuncio #a2b3c4d5"), "A2B3C4D5");
  ok("sem código no texto", extractCode("oi, quanto custa?"), null);
  ok("texto vazio", extractCode(""), null);
  ok("texto nulo", extractCode(null), null);
  ok("ignora string parecida mas curta", extractCode("#A2B3C4"), null);

  ok(
    "renderMessage substitui o placeholder",
    renderMessage("Olá! Vim pelo anúncio. Código {code}", "A2B3C4D5"),
    "Olá! Vim pelo anúncio. Código #A2B3C4D5",
  );
  // Se o usuário apagar {code} do template, o link nasceria sem rastreio.
  ok(
    "template sem placeholder ganha o código no fim",
    renderMessage("Quero saber mais", "A2B3C4D5"),
    "Quero saber mais #A2B3C4D5",
  );
  verdade(
    "ida e volta: o que renderiza é o que extrai",
    extractCode(renderMessage("Oi {code} tudo bem", "ZZZZ9999")) === "ZZZZ9999",
  );

  const slug = generateSlug();
  ok("slug tem 6 chars", slug.length, 6);
  verdade("slug é minúsculo", slug === slug.toLowerCase());
}

console.log("phone.ts");
{
  ok("celular com DDD ganha o 55", normalizePhone("11987654321"), "5511987654321");
  ok("fixo com DDD ganha o 55", normalizePhone("1134567890"), "551134567890");
  ok("já com 55 fica igual", normalizePhone("5511987654321"), "5511987654321");
  ok("tira máscara", normalizePhone("+55 (11) 98765-4321"), "5511987654321");
  ok("vazio", normalizePhone(""), "");
  ok("nulo", normalizePhone(null), "");

  // O ponto central: as duas formas do MESMO celular precisam dar a mesma chave,
  // senão o contato vira duas conversas e o funil conta o lead duas vezes.
  ok("chave canônica tira o nono dígito", canonicalPhoneKey("5511987654321"), "551187654321");
  ok("versão antiga já é a chave", canonicalPhoneKey("551187654321"), "551187654321");
  verdade(
    "as duas formas convergem",
    canonicalPhoneKey("5511987654321") === canonicalPhoneKey("551187654321"),
  );
  // E não pode confundir celular com fixo.
  verdade(
    "fixo não colide com celular",
    canonicalPhoneKey("551134567890") !== canonicalPhoneKey("5511987654321"),
  );
  ok("número estrangeiro do JID passa direto", contactKeyFromJid("12025550123@s.whatsapp.net"), "12025550123");
  ok("celular BR pelo JID casa com a chave", contactKeyFromJid("5511987654321@s.whatsapp.net"), "551187654321");
  ok("digitado sem DDI vira brasileiro (entrada manual)", normalizePhone("11987654321"), "5511987654321");

  verdade("reconhece celular BR de 13", isBrazilMobile("5511987654321"));
  verdade("reconhece celular BR de 12", isBrazilMobile("551187654321"));
  verdade("fixo não é celular", !isBrazilMobile("551134567890"));

  ok("mascara para log", maskPhone("5511987654321"), "5511****4321");
  verdade("número curto não vaza", maskPhone("123") === "***");

  ok("formata para exibição", formatPhoneDisplay("5511987654321"), "+55 (11) 98765-4321");
  ok("formata número de 12", formatPhoneDisplay("551134567890"), "+55 (11) 3456-7890");

  ok("extrai do JID", phoneFromJid("5511987654321@s.whatsapp.net"), "5511987654321");
  verdade("detecta grupo", isGroupJid("120363@g.us"));
  verdade("detecta status broadcast", isGroupJid("status@broadcast"));
  verdade("conversa normal não é grupo", !isGroupJid("5511987654321@s.whatsapp.net"));
  verdade("detecta @lid de conta Business", isLidJid("123456789@lid"));
}

console.log(`\n${total - falhas}/${total} checagens passaram`);
if (falhas > 0) {
  console.error(`${falhas} FALHA(S)`);
  process.exit(1);
}
console.log("TUDO CERTO");
