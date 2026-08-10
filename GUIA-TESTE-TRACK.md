# Como testar o Dashfys Track na prática

Guia para validar o rastreio de ponta a ponta: do clique no anúncio até a
conversão aparecer na plataforma. Tempo total: uns 20 minutos, mais a espera
das plataformas processarem.

## Antes de tudo (vale para Google e Meta)

**1. Conecte o WhatsApp que atende**

- Acesse **Track → WhatsApp** e clique em **Adicionar número**
- No celular que atende os clientes, abra o WhatsApp Business em
  **Configurações → Aparelhos conectados → Conectar aparelho** e leia o QR
- Importante: precisa ser **WhatsApp Business**. No aplicativo comum não
  existem etiquetas, e aí só as frases combinadas funcionam

**2. Diga o que significa venda**

- Acesse **Track → Regras** e escolha o cliente no seletor
- Em **O que conta como VENDA**, marque a etiqueta que o atendente já usa
  (ex: "Pago") e, se quiser, adicione uma frase como `venda realizada`
  na direção "do atendente"
- O estágio **Qualificado** já vem automático: conversa com 3 idas e voltas
  qualifica sozinha, sem ninguém marcar nada

Pronto. A partir daqui os caminhos se separam.

---

## Teste no Google Ads

**3. Crie o link rastreável**

- Acesse **Track → Links → Novo link**
- Escolha o cliente, dê um nome e informe o número de WhatsApp que atende
- Copie o link `/r/xxxxxx` que aparece na lista

**4. Coloque na campanha**

- No Google Ads, cole o link como **URL final** do anúncio
- Em **Configurações da conta**, cole o **modelo de acompanhamento** que a
  tela de Links entrega pronto (é ele que identifica campanha e palavra-chave)
- Confira que a **marcação automática** está ativada na conta
  (Configurações → Marcação automática). Sem ela o rastreio não funciona

> **Se o anúncio leva ao site antes do WhatsApp:** a URL final continua sendo
> o site. Nesse caso cole no `<head>` do site o script que a tela de Links
> mostra em "Se o anúncio leva ao site antes do WhatsApp". Ele leva a origem
> do clique até o botão de WhatsApp sozinho.

**5. Diga para onde a venda sobe**

- No Google Ads, crie uma ação de conversão do tipo **Importação de cliques**:
  Ferramentas → Conversões → Nova ação → **Importar** → Cliques
- Na Dashfys, acesse **Track → Envio**, aba **Google Ads**, e clique em
  **Buscar ações de conversão**
- Escolha a ação criada no estágio **Venda** e clique em **Ligar envio**
- Se quiser, ligue também **Lead qualificado**: manda ao Google um sinal
  melhor que volume bruto

**6. O teste de verdade**

1. No celular, pesquise no Google e **clique no seu próprio anúncio**
   (precisa ser clique real: link copiado não gera o identificador)
2. O WhatsApp abre com uma mensagem pronta contendo um código `#XXXXXXXX`.
   **Envie sem apagar o código**
3. No WhatsApp que atende, **responda** a conversa
4. Troque mais uma ou duas mensagens (isso vira "Qualificado" sozinho)
5. Marque a conversa com a etiqueta **Pago** (ou envie a frase combinada)

**7. Confira o resultado**

- Em **Track → Visão geral**: a conversa aparece com a campanha de origem e
  o funil mostra a venda. No topo, o selo verde **"enviadas ao Google"**
  confirma o envio (a fila roda a cada 5 minutos)
- No Google Ads: Ferramentas → Conversões → sua ação → o upload aparece.
  A estatística pode levar de 3 a 24 horas para refletir no relatório

---

## Teste no Meta

No Meta é mais simples: **não existe link para configurar**. Quem clica num
anúncio de WhatsApp já chega com a identificação da campanha dentro da
própria mensagem, e o Track captura sozinho.

**3. Diga para onde a venda sobe**

- Acesse **Track → Envio**, aba **Meta**, e clique em **Buscar datasets da BM**
- Escolha o dataset do cliente na lista (vem das BMs que você já conectou
  na Dashfys)
- Clique em **Testar permissão**: um evento de teste aparece no Gerenciador
  de Eventos do Meta e não conta para a campanha. Se der erro, a tela mostra
  o motivo exato
- Escolha o nome do evento por estágio (Venda = **Purchase**) e **Ligar envio**

**4. O teste de verdade**

1. No celular, clique no seu **anúncio de WhatsApp** (campanha de mensagem /
   Click to WhatsApp) e envie a mensagem que abrir
2. No WhatsApp que atende, responda e troque algumas mensagens
3. Marque a etiqueta **Pago** (ou envie a frase combinada)

**5. Confira o resultado**

- Em **Track → Visão geral**: a conversa aparece com origem "Anúncio do Meta"
- No **Gerenciador de Eventos** do Meta: o evento **Purchase** aparece no
  dataset, com origem "Mensagens comerciais". A atribuição na campanha leva
  algumas horas

---

## Se algo não bater

| Sintoma | Causa mais comum |
|---|---|
| Cliquei e a conversa não apareceu no painel | O código foi apagado da mensagem antes de enviar. A conversa entra como "sem atribuição" |
| A conversa apareceu mas sem campanha | Marcação automática desligada no Google (sem gclid não há amarração) |
| Etiqueta marcada e nada mudou | A etiqueta marcada no celular é outra: confira em Track → Regras qual está selecionada |
| "X conversões não subiram" no topo do painel | O motivo aparece ao lado do selo (ação de conversão errada, prazo vencido, conta desconectada). Corrigida a causa, a fila tenta de novo sozinha |
| Nenhuma etiqueta aparece em Regras | O número conectado é WhatsApp comum, não Business, ou o aparelho ainda não sincronizou (mexa em qualquer etiqueta no celular que a lista atualiza) |
| Teste de permissão do Meta falhou | O acesso da BM não alcança o dataset: use "opções avançadas" na aba Meta e cole um token de system user |

Duas coisas que valem lembrar no teste: o clique precisa ser **real** (link
colado no navegador não carrega o identificador do Google), e a venda marcada
sobe na próxima passada da fila, **em até 5 minutos**.
