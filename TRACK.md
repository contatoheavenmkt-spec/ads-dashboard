# Dashfys Track

Rastreio de venda do clique no anúncio até a etiqueta no WhatsApp, e devolução
da conversão para o Google Ads.

É a segunda linha de produto da Dashfys. Não altera nada do que já existia: o
dashboard, o CRM e as integrações seguem iguais.

## O caminho do dado

```
Anúncio Google Ads
   ↓  clique (gera gclid)
/r/<slug>            redirecionador: grava o clique e gera um código curto
   ↓  302
wa.me/<numero>?text=Olá... #A2B3C4D5
   ↓  a pessoa envia
worker Baileys       lê o código, amarra a conversa ao gclid
   ↓  atendente conversa e marca "Pago" no celular
labels.association   worker registra a etiqueta
   ↓  regras do workspace
TrackEvent (venda) → TrackDispatch → uploadClickConversions
   ↓
Google Ads passa a otimizar por venda real, não por clique
```

## Como ligar um cliente

1. **`/track/links`**: criar o link e colar como URL final do anúncio. A tela
   entrega junto o modelo de acompanhamento para colar nas configurações da
   conta (é ele que traz campanha, grupo e palavra sem gastar chamada de API).
2. **`/track/whatsapp`**: adicionar o número e ler o QR no celular que atende.
   Precisa ser **WhatsApp Business**: etiqueta não existe no app pessoal.
3. **`/track/config`**: dizer qual etiqueta significa venda. A lista aparece
   sozinha depois que o aparelho sincroniza.
4. Conferir que a **marcação automática** está ligada na conta do Google. Sem
   ela não existe gclid, e sem gclid nenhuma venda volta para a campanha.

## Processos

| O quê | Onde | Frequência |
|---|---|---|
| Worker do WhatsApp | PM2 `dashfys-track` | contínuo |
| Envio de conversões | `/api/cron/track-dispatch` | a cada 5 min |
| Varredura da IA | `/api/cron/ai-scan` | 1x por dia |
| Purga de conversa | `/api/cron/track-retention` | 1x por dia |

O worker **só observa**: nunca envia mensagem, não marca online e não
sincroniza histórico completo. É o maior redutor de risco de bloqueio
disponível e sai de graça, porque o produto só precisa ler.

## Comandos

```bash
npm run worker        # sobe o worker localmente
npm run track:check   # 202 checagens das funções puras
npm run track:e2e     # ensaio do ciclo completo, com banco real
npm run ai:check      # 45 checagens do motor de sugestões
```

Rodar `track:e2e` antes de qualquer deploy do Track: é a única forma de provar
o caminho inteiro sem depender de um celular na mão. Ele cria dados reais e
apaga tudo no fim.

## Decisões que parecem estranhas e não são

**O funil é cumulativo.** Registrar "venda" cria "qualificado" e "respondeu"
retroativamente. Sem isso o painel mostraria "1 venda, 0 qualificados", e
ninguém confia num funil que não fecha a conta.

**Atribuição por proximidade não sobe para o Google.** Quando a pessoa apaga a
mensagem pronta, o código se perde e a conversa é casada por palpite. Isso
aparece no painel como baixa confiança, mas não vira conversão automática:
conversão falsa treina o algoritmo do cliente contra ele mesmo.

**Parar um número não desloga.** `Desligar` fecha o socket e mantém a
credencial, então religar não pede QR. `Encerrar sessão` é outra ação.

**A chave do contato descarta o nono dígito.** É o que faz `5511987654321` e
`551187654321` caírem na mesma conversa. Como aquele número não é discável, o
telefone de verdade fica em `contactPhone`, e é ele que vai para o CRM.

**A IA não aplica nada.** Ela propõe e explica com os números. Ligar a escrita
na conta de anúncios é uma decisão para depois de o gestor acompanhar alguns
dias e confirmar que as propostas batem com o que ele faria.

## Limites conhecidos

- **Baileys é biblioteca não oficial.** O WhatsApp pode bloquear o número, e o
  risco é maior em chip novo. Use número dedicado ou já aquecido. O conector
  está isolado em `worker/wa/`, então trocar pela Cloud API oficial no futuro
  não mexe no resto.
- **Etiqueta só existe no WhatsApp Business.** Em conta pessoal o funil depende
  só das frases combinadas, e a tela avisa isso.
- **Se a pessoa apagar a mensagem pronta**, a conversa perde a atribuição
  automática. Mensagem curta reduz muito isso; a taxa aparece no painel.
- **Meta (CTWA) ainda não envia conversão.** O `ctwa_clid` já é capturado da
  própria mensagem e fica guardado, então ligar depois é só o despachante.

## Estrutura

```
src/lib/track/     lógica pura: código, telefone, regras, funil, eventos
src/lib/ai/        motor de sugestões e coletor do Google Ads
src/app/r/[code]/  redirecionador (caminho quente do anúncio)
worker/            processo Baileys, separado do Next
  wa/              sessões de WhatsApp
  pipeline/        mensagem, etiqueta, funil, identidade do contato
  control/         reconciliação e HTTP loopback
```

Os arquivos de `src/lib/track/` usam **imports relativos entre si** de
propósito: o worker os importa fora do resolver de paths do Next.

## Migrations

Todas aditivas, com `ROLLBACK.sql` ao lado:

- `20260807190000_track_module` — 10 tabelas do Track
- `20260807203000_ai_sugestoes` — 5 tabelas da IA
- `20260807210000_track_braid_e_telefone` — wbraid, gbraid e telefone discável

A tabela `Lead` **não sofreu DDL nenhum**. A ligação é
`TrackConversation.leadId`, e a back-relation em `Lead` é campo virtual do
Prisma.
