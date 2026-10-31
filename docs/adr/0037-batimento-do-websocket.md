# 0037. Batimento (ping/pong) no WebSocket e queda do WS não tira da call quem está na mídia

- Status: aceito
- Data: 2026-10-31

## Contexto
Incidente de 31/10/2026 (canal de voz do servidor BH RX): a rede de um usuário
trocou de IP no meio da call. O LiveKit reconectou sozinho (ele tem ping e
reconexão próprios), o HTTP seguiu pelas conexões novas, mas o WebSocket de
chat ficou meio aberto: sem erro e sem `onclose`, o app seguiu achando que
estava conectado por mais de 10 minutos e nunca tentou reconectar. O servidor
fechou o lado dele cerca de 4 minutos depois, deu a presença como offline e,
passada a tolerância de 15 s (`disconnectGrace`), tirou a pessoa da call. Ela
seguia falando e ouvindo, mas sumiu da lista da sala para todo mundo e
aparecia como offline.

Forças: o navegador não expõe ping/pong do protocolo WebSocket para o
JavaScript; janela em segundo plano tem timers espaçados; backend e app
atualizam em momentos diferentes (app novo pode falar com servidor antigo);
sem dependência nova; o ADR 0018 já decidiu que a sala de mídia é o árbitro de
quem está na call.

## Opções consideradas
1. **Ping do servidor (frames de controle)**: o servidor descobre o cliente
   morto mais cedo, mas o problema é o inverso: o cliente não descobre, e o
   JavaScript não vê esses frames. Não resolve. Descartada.
2. **Eventos `online`/`offline` do navegador**: não disparam em toda troca de
   rede (Wi-Fi para cabo, IP renovado, VPN). Insuficiente. Descartada.
3. **Batimento na aplicação** (padrão de heartbeat de Socket.IO, Phoenix e
   Discord gateway): o app manda `{"type":"ping"}` a cada 25 s; o servidor
   responde `pong`; qualquer mensagem do servidor conta como sinal de vida; sem
   resposta em 10 s depois de um ping, o app larga a conexão e reconecta.
   **Escolhida.**

E, no servidor, para quem fica sem WS mas segue na mídia:

4. **Saída por queda do WS confere o LiveKit antes** (`MediaPresence.KeepWhoIsInMedia`):
   coerente com o ADR 0018. Quem está na sala de mídia não sai por causa do WS;
   quando sair de verdade da mídia, a varredura (`Sweep`) tira. LiveKit sem
   resposta: sai como antes. Vale também para a subida do servidor (que usa o
   mesmo caminho). **Escolhida.**

## Decisão
- Frontend: `shared/lib/wsHeartbeat.ts` (regra pura) e `shared/api/ws.ts`
  (`WsClient`). A conexão só é dada como morta depois de o servidor provar que
  responde `pong` naquela conexão: servidor antigo, que ignora o ping, nunca
  derruba ninguém. O `pong` não chega ao `onEvent` do app. A reconexão segue o
  caminho normal (`onLost`, backoff, `onOpen(true)`), que já ressincroniza a
  call, a presença e as listas.
- Backend: `platform/websocket/heartbeat.go` responde o ping na fila de envio do
  cliente (fila cheia: descarta, como os outros eventos);
  `call/media_disconnect.go` embrulha a saída por queda do WS com a consulta à
  sala do LiveKit, sem método novo em `call/service.go`.

## Consequências
- Pior caso para o app perceber a meia conexão: ~35 s com a janela em primeiro
  plano (até ~2 min com timers espaçados em segundo plano), contra mais de 10 min.
- Quem está no LiveKit continua na lista da call para todos mesmo com o WS
  caído; quem saiu da mídia sai da lista em até ~1 min (varredura do ADR 0018).
- Um ping a cada 25 s por conexão: tráfego desprezível.
- O app do celular (`mobile/`) tem cliente WS próprio e não ganha o batimento
  neste PR.
