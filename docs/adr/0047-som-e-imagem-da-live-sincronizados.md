# 0047. Som e imagem da live sincronizados (SyncStreams por sala)

- Status: aceito
- Data: 2026-11-02
- Relacionado: [0020](0020-qualidade-das-lives.md), [0032](0032-sinais-de-qualidade-das-lives-e-calls.md)

## Contexto

Relato de usuário ("Apresentação de tela bugada", 3 votos): "imagem atrasada e
áudio adiantado" nas lives. A live publica o vídeo (`screen_share`) e o som
(`screen_share_audio`) em faixas separadas. O navegador só alinha som e
imagem (RTCP SR → mesmo relógio, atraso do áudio ajustado ao do vídeo) quando
as duas faixas chegam no **mesmo MediaStream** (o `msid` do SDP vira o
`sync_group` do WebRTC).

Evidência:

- O LiveKit (v1.13.11) só junta as faixas de um participante por stream com
  `room.sync_streams` ligado (`pkg/rtc/subscribedtrack.go`:
  `PackSyncStreamID(publisher, stream)`); sem ele, cada faixa vem num stream
  próprio (`PackStreamID(publisher, trackID)`). A configuração da VPS
  (`LIVEKIT_CONFIG` no `docker-compose.yml`) não liga.
- Medido num LiveKit 1.13.11 local, assinante em Go: sem a opção, o vídeo
  chega em `PA_…|TR_VS…` e o som em `PA_…|TR_As…` (streams diferentes, sem
  sincronia); com `SyncStreams` na `RoomConfiguration` do token, os dois chegam
  em `PA_…|screen`.
- Sem sincronia, cada faixa toca assim que pode: o som (quadros de 20 ms,
  NetEq) sai antes do vídeo (captura, codificador, quadros grandes, jitter
  buffer, decodificador), exatamente o "imagem atrasada, áudio adiantado".

## Opções consideradas

1. **`sync_streams: true` no `LIVEKIT_CONFIG`.** Vale para todas as salas, mas
   mudar o `LIVEKIT_CONFIG` exige recriar o LiveKit (derruba todas as chamadas,
   ver HOSPEDAGEM.md) e o PC de casa/servidor próprio precisaria do mesmo ajuste.
2. **Sincronizar no cliente** (`jitterBufferTarget` no receptor do som da live
   igual ao atraso medido do vídeo). Sem mudar o servidor, mas é estimar à mão o
   que o WebRTC já faz com os relógios do RTCP; erra com congelamentos e troca
   de camada.
3. **`SyncStreams` na `RoomConfiguration` de cada token (escolhida).** O
   LiveKit aplica a configuração do token ao criar a sala e também quando alguém
   entra numa sala existente (`roomallocator.CreateRoom`); não precisa recriar o
   LiveKit nem mudar o compose, e vale para qualquer servidor que rode este
   backend.

## Decisão

- `platform/livekit/token.go`: todo token de sala (pessoa, bot de música, tela
  pelo helper nativo) leva `RoomConfiguration{SyncStreams: true}`.
- O padrão do LiveKit agrupa microfone e câmera no stream `camera` (e tela com
  som da tela em `screen`). Com a sincronia ligada, a voz de quem está com a
  câmera passaria a esperar o vídeo da câmera. O app publica o microfone no
  stream `voz` (`micPublisher.ts`): a voz continua sem esperar nada; só o som
  da live espera a imagem dela.

## Consequências

- O som da live passa a tocar alinhado com a imagem: atrasa o mesmo tanto que o
  vídeo chega depois (o atraso total da live não muda, é o do vídeo).
- Com `SyncStreams`, o LiveKit não reaproveita transceivers no assinante
  (`SupportsTransceiverReuse`): cada nova assinatura (assistir/deixar de
  assistir uma live) cria um m-line novo no SDP. Numa call longa com muitas
  trocas a renegociação fica maior. Se aparecer lentidão para começar a
  assistir, medir o tempo do "assistir" até o primeiro quadro.
- Salas que já existem pegam a opção quando a próxima pessoa entra; quem já
  estava na sala recebe o comportamento novo ao reentrar.
- Apps antigos (até atualizarem) publicam o microfone no stream `camera`: quem
  estiver com a câmera ligada nesse meio tempo tem a voz alinhada ao vídeo da
  câmera (mais atraso). O app mobile ainda publica o microfone no padrão
  (pendente: `setMicrophoneEnabled(on, undefined, { stream: 'voz' })`).
- Firefox não suporta (o LiveKit desliga para ele sozinho).

## Fontes

- LiveKit: `config-sample.yaml` (`room.sync_streams`), `pkg/rtc/subscribedtrack.go`,
  `pkg/service/roomallocator.go`, `pkg/service/utils.go` (`SetRoomConfiguration`), v1.13.11.
- livekit-client 2.23: `extractTrackSid` (lê o `TR_` do id da faixa quando o
  stream é `PA|screen`).
- WebRTC: `sync_group` = primeiro stream id da faixa recebida
  (`RtpStreamsSynchronizer`).
