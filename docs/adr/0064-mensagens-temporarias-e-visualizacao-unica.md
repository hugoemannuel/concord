# 0064. Mensagens temporárias e foto/vídeo de visualização única nas DMs

- Status: proposto
- Data: 2026-11-12
- Relacionado: spec [2026-11-12-mensagens-temporarias-design](../superpowers/specs/2026-11-12-mensagens-temporarias-design.md)

## Contexto

Pedido: mensagens que somem sozinhas e fotos/vídeos que só abrem uma vez, como no WhatsApp,
só em DM e grupo privado, no desktop e no app web (Android depois). As forças:

- **Valer no servidor, não só na tela.** Mensagem vencida não pode continuar no banco nem
  voltar numa listagem; a mídia de visualização única não pode ser baixada de novo com o token
  de mídia comum (que vale 1 h e abre qualquer arquivo da sala).
- **App antigo (Android) não pode quebrar a regra.** Ele mostra qualquer anexo que vier na
  mensagem e baixa com o token comum.
- **Vídeo.** O `<video>` busca o arquivo em pedaços (Range); "ver" precisa cobrir vários pedidos.
- **Sem dependência nova** (regra 7) e sem engordar god files.

## Opções consideradas

### Apagar as mensagens vencidas

1. **`expires_at` na mensagem + tarefa periódica no Go (escolhida).** Igual ao `message/janitor.go`
   e à retenção do audit. As consultas filtram `expires_at > now()`, então o atraso da tarefa
   (até 1 min) não aparece para ninguém.
2. **pg_cron no Postgres.** Extensão nova no banco e no deploy; não avisa o app em tempo real.
3. **Esconder só no app.** O texto fica no banco: não cumpre o pedido.

### Entregar a mídia de visualização única

1. **Abrir gera uma permissão curta só daquele arquivo (escolhida).** `POST .../open` grava a
   visualização (uma por pessoa) e devolve um JWT `type: "view_once"` com o id do anexo e 5 min de
   validade. O `ServeFile` aceita esse token só para aquele anexo; o token `media` comum é recusado
   para anexos de visualização única. Vídeo toca com Range normalmente.
2. **Abrir devolve o arquivo inteiro.** Sem token novo, mas o vídeo precisa baixar inteiro antes
   de tocar, fica todo na memória, e uma queda no meio gasta a visualização sem a pessoa ver.
3. **Só marcar no app.** Qualquer cliente (ou o Android antigo) baixa com o token comum.

## Decisão

Opção 1 nos dois casos. A mensagem de visualização única sai **sem o anexo** em `attachments`
para quem recebe (vai num campo novo, `view_once`), então o app Android atual simplesmente não a
vê como mídia e não gasta a visualização.

## Consequências

- Tipo novo de JWT (`view_once`), recusado pelo AuthMiddleware e pelo WebSocket como o `media`.
- No desktop, `BrowserWindow.setContentProtection(true)` enquanto a mídia está aberta: tira a
  janela das capturas no Windows 10 2004+ e na maior parte do macOS; não existe no Linux nem no
  navegador. É um extra, não uma garantia (a pessoa sempre pode fotografar a tela).
- Uma tarefa periódica a mais (a cada minuto) com consulta indexada em `messages(expires_at)`.
