# 0046. Ticket de uso único e 30 s para abrir o WebSocket, no lugar do token na URL

- Status: aceito
- Data: 2026-11-01

## Contexto
A auditoria de segurança (2026-10-31, item 11) achou o WebSocket abrindo com
`/ws?token=<token de acesso>`: o JWT de 24 h vai na URL. O log do gin já troca
o valor por `REDACTED` (`platform/httplog`), mas a URL passa por proxies,
inspeção TLS corporativa, histórico e ferramentas de rede, e quem a pega usa a
API inteira por até 24 h. O navegador não deixa pôr `Authorization` no
handshake do WebSocket. Forças: nada de dependência nova; um processo de
backend só (sem Redis); apps antigos (desktop, web em cache, Android) continuam
mandando `?token=` por um tempo; servidores próprios ([ADR 0042](0042-servidor-proprio-guiado-por-ia.md))
podem ficar numa versão antiga enquanto o app já atualizou; a revogação de
sessão ([ADR 0039](0039-revogacao-de-sessao.md)) precisa continuar valendo.

## Opções consideradas
1. **Ticket curto pedido por HTTP autenticado** (o padrão "WebSocket ticket"):
   `POST` com o Bearer devolve um valor aleatório de uso único que vale segundos;
   o WS abre com `?ticket=`. O que vaza na URL não serve para nada depois de
   usado ou vencido. Custa um pedido HTTP a cada conexão.
2. **Token na primeira mensagem** (como o IDENTIFY de gateways de chat): conecta
   sem credencial e manda o token no primeiro quadro. Nada na URL, mas o hub
   passa a ter conexões ainda não autenticadas (limite de tempo, estado novo em
   `readPump`, mudança no protocolo dos três apps de uma vez).
3. **Token no `Sec-WebSocket-Protocol`**: o navegador deixa mandar; é um truque
   (o servidor precisa ecoar o subprotocolo, proxies e logs tratam o cabeçalho
   de jeitos diferentes) e o token continua sendo o de 24 h.

O repo já tem o padrão de token curto por HTTP para mídia (`/api/media/token`).

## Decisão
Opção 1.

- `POST /api/ws/ticket` com `Authorization: Bearer` (conta **ou** visitante,
  mesma regra do connect de antes, conferindo a versão da sessão). Responde
  `{ticket, expires_in: 30}`. Sessão revogada: 401 `session_revoked`; banco
  fora: 503 (ninguém é deslogado por falha nossa).
- Ticket: 32 bytes de `crypto/rand` em base64url. Guardado **só como sha256**,
  em memória (`platform/websocket/TicketStore`) com as credenciais (usuário,
  tipo, versão da sessão). Uso único (sai do mapa ao ser usado), 30 s, no
  máximo 20 em aberto por conta (429 acima disso); vencidos varridos no máximo
  uma vez a cada 30 s. Reinício do backend apaga os tickets: o app pede outro.
- `/ws?ticket=`: gasta o ticket e confere a versão da sessão **de novo** (quem
  saiu de todos os dispositivos nesses 30 s não entra). Com `?ticket=`, só ele
  vale: ticket inválido não cai para um `?token=` que viesse junto. Conexões já
  abertas continuam fechando com 4001 na revogação (ADR 0039).
- `ticket` entrou na lista do redator de logs (`httplog.RedactQuery`).
- Clientes (desktop/web `shared/api/wsTicket.ts`, Android
  `mobile/src/shared/api/wsTicket.ts`): o `WsClient` pede um ticket novo a cada
  tentativa de conexão. Sem sessão: não conecta. Falha de rede ou 5xx: conta
  como queda e tenta de novo com a espera de sempre. **404** (servidor antigo,
  sem a rota): conecta com `?token=` como antes.

### Compatibilidade e plano para desligar o `?token=`
O `/ws?token=` continua aceito. Cada conexão assim gera uma linha
`[ws] conexão com ?token= legado (N desde o boot; cliente X)`, onde X é só
`mobile`, `salinha/<versão>` (do user agent do Electron) ou `navegador`, sem o
user agent inteiro. Para desligar:

1. Publicar esta versão no desktop, no web e no Android.
2. Acompanhar o log (`journalctl -u concord-server | grep "?token= legado"`). Quando
   por 14 dias seguidos só aparecerem versões que ninguém usa mais (ou nada),
   remover o ramo `?token=` de `ConnectAuth.connectUser` e o fallback do 404
   nos dois `wsTicket.ts`.
3. Servidores próprios: o fallback do 404 só sai depois que o
   `self-update.sh` deles tiver puxado esta versão (o app novo precisa
   continuar conectando num servidor antigo até lá).

## Consequências
- Positivas: a URL do WebSocket deixa de carregar uma credencial reutilizável;
  revogação continua valendo também entre pedir o ticket e conectar; sem tabela
  nem dependência nova.
- Negativas / riscos: um pedido HTTP a mais por conexão (inclusive em cada
  reconexão); com mais de um processo de backend os tickets precisariam de um
  armazenamento comum (hoje há um só). Enquanto o `?token=` existir, quem pegar
  um token de acesso ainda abre o WS com ele.
- Como reverter: os clientes voltam a montar a URL com `?token=` (o backend
  ainda aceita); a rota `/api/ws/ticket` pode ficar sem uso.
