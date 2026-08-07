/**
 * Checagem da leitura de mensagem do WhatsApp.
 *
 * Os formatos abaixo saíram do WAProto do Baileys 7.0.0-rc.9 lido no
 * node_modules, não de memória. É a camada onde o erro passa despercebido:
 * mensagem sem texto extraído significa código de rastreio perdido, e uma
 * venda que nunca volta para a campanha que a gerou.
 */
import {
  ehAntigaDemais,
  ehMensagemDeVerdade,
  lerConteudo,
  lerTimestamp,
} from "../src/lib/track/mensagem";
import { extractCode } from "../src/lib/track/code";

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

console.log("extração de texto");
{
  ok("conversation simples", lerConteudo({ conversation: "oi" }).texto, "oi");
  ok("extendedTextMessage", lerConteudo({ extendedTextMessage: { text: "quanto custa?" } }).texto, "quanto custa?");
  ok("legenda de imagem", lerConteudo({ imageMessage: { caption: "olha isso" } }).texto, "olha isso");
  ok("legenda de vídeo", lerConteudo({ videoMessage: { caption: "veja" } }).texto, "veja");
  ok("áudio não tem texto", lerConteudo({ audioMessage: { seconds: 5 } }).texto, null);
  ok("áudio é tipo audio", lerConteudo({ audioMessage: { seconds: 5 } }).tipo, "audio");
  ok("imagem sem legenda", lerConteudo({ imageMessage: {} }).tipo, "image");
  ok("figurinha", lerConteudo({ stickerMessage: {} }).tipo, "sticker");
  ok("mensagem vazia", lerConteudo(null).texto, null);
  ok("resposta de botão", lerConteudo({ buttonsResponseMessage: { selectedDisplayText: "Quero sim" } }).texto, "Quero sim");

  // Wrappers: sem desembrulhar, a mensagem parece vazia e o código se perde.
  ok(
    "mensagem efêmera",
    lerConteudo({ ephemeralMessage: { message: { conversation: "some depois" } } }).texto,
    "some depois",
  );
  ok(
    "ver uma vez v2",
    lerConteudo({ viewOnceMessageV2: { message: { imageMessage: { caption: "rápido" } } } }).texto,
    "rápido",
  );
  ok(
    "documento com legenda",
    lerConteudo({ documentWithCaptionMessage: { message: { documentMessage: { caption: "segue o orçamento" } } } }).texto,
    "segue o orçamento",
  );
  // Enviada de outro aparelho pareado (desktop). A lib não desembrulha este.
  ok(
    "deviceSentMessage (mandou do desktop)",
    lerConteudo({ deviceSentMessage: { message: { conversation: "mandei do PC" } } }).texto,
    "mandei do PC",
  );
  ok(
    "wrapper dentro de wrapper",
    lerConteudo({ ephemeralMessage: { message: { viewOnceMessageV2: { message: { conversation: "duplo" } } } } }).texto,
    "duplo",
  );

  // O caso que o produto inteiro depende: o código chegar íntegro.
  const vinda = { extendedTextMessage: { text: "Olá! Vim pelo anúncio. Código #A2B3C4D5" } };
  ok("código sobrevive à extração", extractCode(lerConteudo(vinda).texto), "A2B3C4D5");
  const efemera = { ephemeralMessage: { message: { conversation: "Vim pelo anúncio #ZZZZ9999" } } };
  ok("código sobrevive dentro de wrapper", extractCode(lerConteudo(efemera).texto), "ZZZZ9999");
}

console.log("atribuição de anúncio (Meta)");
{
  // contextInfo mora em cada TIPO de conteúdo, nunca na raiz da mensagem.
  const doAnuncio = {
    extendedTextMessage: {
      text: "vi seu anúncio",
      contextInfo: {
        externalAdReply: { ctwaClid: "ABC123", sourceId: "120445", sourceUrl: "https://fb.me/x" },
      },
    },
  };
  const c = lerConteudo(doAnuncio);
  ok("lê o ctwaClid", c.ctwaClid, "ABC123");
  ok("lê o id do anúncio", c.adId, "120445");
  ok("lê a url do anúncio", c.adUrl, "https://fb.me/x");
  ok("e o texto continua vindo", c.texto, "vi seu anúncio");

  const emImagem = {
    imageMessage: { caption: "esse aqui", contextInfo: { externalAdReply: { ctwaClid: "IMG9" } } },
  };
  ok("ctwaClid em imagem", lerConteudo(emImagem).ctwaClid, "IMG9");

  ok("mensagem comum não tem ctwaClid", lerConteudo({ conversation: "oi" }).ctwaClid, null);
  // contextInfo sem externalAdReply é resposta a mensagem, não anúncio.
  ok(
    "resposta citada não é anúncio",
    lerConteudo({ extendedTextMessage: { text: "isso", contextInfo: { stanzaId: "X" } } }).ctwaClid,
    null,
  );
}

console.log("filtro de mensagem de verdade");
{
  verdade("texto é mensagem", ehMensagemDeVerdade({ message: { conversation: "oi" } }));
  verdade("imagem é mensagem", ehMensagemDeVerdade({ message: { imageMessage: {} } }));
  // Estes três chegam pelo mesmo evento e contariam como resposta do lead.
  verdade("reação NÃO é mensagem", !ehMensagemDeVerdade({ message: { reactionMessage: { text: "👍" } } }));
  verdade("protocolo NÃO é mensagem", !ehMensagemDeVerdade({ message: { protocolMessage: { type: 0 } } }));
  verdade("voto em enquete NÃO é mensagem", !ehMensagemDeVerdade({ message: { pollUpdateMessage: {} } }));
  // Falha de decriptação chega sem conteúdo, com messageStubType CIPHERTEXT.
  verdade("falha de decriptação NÃO é mensagem", !ehMensagemDeVerdade({ messageStubType: 2, message: null }));
  verdade("sem campo message NÃO é mensagem", !ehMensagemDeVerdade({}));
  verdade(
    "chave de sessão do Signal NÃO é mensagem",
    !ehMensagemDeVerdade({ message: { senderKeyDistributionMessage: {} } }),
  );
  verdade(
    "reação dentro de wrapper também é barrada",
    !ehMensagemDeVerdade({ message: { ephemeralMessage: { message: { reactionMessage: { text: "❤" } } } } }),
  );
}

console.log("timestamp");
{
  const seg = 1_775_000_000;
  ok("segundos como number", lerTimestamp(seg).getTime(), seg * 1000);
  ok("segundos como string", lerTimestamp(String(seg)).getTime(), seg * 1000);
  // Protobuf entrega Long, não number.
  ok("Long do protobuf", lerTimestamp({ toNumber: () => seg }).getTime(), seg * 1000);
  ok("Long com low", lerTimestamp({ low: seg, high: 0 }).getTime(), seg * 1000);
  verdade("indefinido vira agora", Math.abs(lerTimestamp(undefined).getTime() - Date.now()) < 5000);

  verdade("mensagem de agora não é antiga", !ehAntigaDemais(new Date()));
  verdade("mensagem de 2 dias não é antiga", !ehAntigaDemais(new Date(Date.now() - 2 * 86400_000)));
  // Sincronização pode arrastar histórico: conversa de meses atrás não pode
  // virar "lead novo" e estragar o funil do cliente.
  verdade("mensagem de 30 dias é antiga demais", ehAntigaDemais(new Date(Date.now() - 30 * 86400_000)));
}

console.log(`\n${total - falhas}/${total} checagens passaram`);
if (falhas > 0) {
  console.error(`${falhas} FALHA(S)`);
  process.exit(1);
}
console.log("TUDO CERTO");
