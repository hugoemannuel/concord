# 0074. Sinais novos de mídia: o que as análises de produção não conseguiram responder

- Status: aceito
- Data: 2026-11-25
- Complementa: [0032](0032-sinais-de-qualidade-das-lives-e-calls.md) (mesmo padrão:
  pergunta → sinal → ação), [0029](0029-observabilidade-das-lives.md) (mesmo
  pipeline, mesmas tabelas), [0069](0069-metricas-do-aparelho.md) (CPU e janela do
  aparelho, que não são repetidas aqui), [0073](0073-codec-e-decodificacao-da-live.md)

## Contexto

As três análises da telemetria de 11/11 a 25/11 (quem transmite, quem assiste e a
voz) terminaram com uma lista do que não deu para responder por falta de sinal. As
que pesam mais:

- **48 % das lives saem abaixo do fps escolhido, quase sempre "pela captura"**, e
  58 % dos congelamentos de quem assiste caem nas amostras com a captura de quem
  transmite abaixo de 80 % do alvo. Só que o Chromium **para de capturar quando a
  tela não muda** (tela parada não gera quadro; ver Fontes). "Captura baixa" mistura
  duas coisas que pedem ações opostas: tela parada (nada a fazer, e o congelamento
  que o `freezeCount` conta ninguém vê) e captura que não dá conta (monitor grande,
  janela, CPU).
- Não se sabe quanto tempo a pessoa espera do clique até a live no ar, nem quantas
  lives falham ao começar.
- A perda na subida de quem transmite nunca foi medida (`loss_pct` e `jitter_ms`
  sempre nulos em `transmite`).
- A live nativa não manda `codec_escolhido`: não dá para comparar motor nativo ×
  Chromium.
- AV1 sai "proc." em 100 % das detecções, mesmo em RTX 40 e RX 9060 XT; a pergunta
  ao `encodingInfo` inclui o `scalabilityMode: L1T3` e não se sabe se é ele que barra.
- A falha do decodificador só diz o codec, não qual decodificador falhou.
- Na voz: se a queda coincidiu com o PC dormindo, se o processamento do microfone
  (RNNoise, modificador, portão; ADR 0005) engasga no PC de quem fala e se a saída
  de áudio do PC de quem ouve falha.
- Nenhum sinal mede a câmera.

## Opções consideradas

1. **Mandar mais do `getStats()`** (todos os campos do `outbound-rtp`, `inbound-rtp`,
   `media-playout`): responde tudo, mas é volume e coluna "para ter", contra o pedido
   do dono (o mesmo motivo da 0032).
2. **Um tipo de sessão novo para câmera e para o áudio local** (`camera`, `audio`),
   com linhas próprias: separa bem, mas multiplica as linhas (uma amostra por minuto
   a mais por pessoa em call) e as sessões.
3. **Colunas nulas na mesma amostra de hoje e dois eventos novos**, cada uma ligada a
   uma pergunta e a uma ação, lidas do que o app já lê no mesmo ciclo (escolhida).
   É o que a 0032 fez e o que o OpenTelemetry chama de "atributos na mesma medição"
   em vez de série nova.

## Decisão

| # | Pergunta | Sinal | Ação que ele habilita |
|---|---|---|---|
| 1 | A captura cai por **tela parada** ou porque **não dá conta**? É o tamanho do monitor? Janela ou monitor? | `source_width`, `source_height` (tamanho da fonte antes de reduzir, `getSettings()` guardado no `rememberScreenSource`; na nativa, o `capturing` do helper) e `surface` (`monitor`, `window`, `browser`; `displaySurface`) em cada amostra de `transmite`. Bytes por quadro = `bitrate_kbps × 125 / fps`, já deriváveis (sem coluna) | Captura baixa com bytes por quadro grandes num monitor ≥ 1440p → preset por tamanho de monitor ou captura nativa (ADR 0031). Só em janela → a captura de janela do Chromium. Bytes por quadro minúsculos → tela parada, não é problema |
| 1b | …é a CPU do PC? | **Nenhum sinal novo**: `device_samples` (ADR 0069) já tem a CPU do app por minuto. Cruza por pessoa e horário (consulta no OBSERVABILIDADE.md) | CPU do app ≥ 80 % de um núcleo com captura baixa → captura nativa |
| 2 | Quanto tempo do OK no seletor até a live no ar? Onde a live falha ao começar? | `start_ms` na 1ª amostra de `transmite` (do stream do seletor ao fim da publicação; na nativa, do `capturing` ao `published`) e evento `live_falhou` na sessão da voz (a live não chegou a existir): `seletor`, `codec` ou `publicação`, com o nome do erro (`NotReadableError`, `TimeoutError`; na nativa, o código do helper) | Etapa `publicação` lenta ou falhando para muitos → servidor/SFU; `seletor` com `NotReadableError` → driver/captura do sistema; `codec` → `screenCodecSupport` |
| 3 | A rede de **quem transmite** perde na subida? | `loss_pct` e `jitter_ms` de `transmite` passam a ser preenchidos: diferença de `packetsLost` do `remote-inbound-rtp` do envio principal sobre os pacotes mandados no intervalo (mesma conta da voz, emenda de 2026-11-25 da 0032) | Perda na subida → a rede de quem transmite (aviso para ela, banda menor), não a do servidor nem a de quem assiste |
| 4 | Motor nativo × Chromium | A live nativa manda `codec_escolhido` com `nativo: h264 placa` (ou `proc.`) e o tamanho da fonte; a do Chromium continua como está (sem `nativo` = Chromium). O painel ganha a distribuição por motor | Decidir o marco 2 da ADR 0031 com fps, ms do codec e congelamentos lado a lado |
| 5 | O bitrate no teto deixa a imagem ruim? | `qp` (transmite): QP médio do intervalo (`qpSum/framesEncoded`, a conta que o painel "Sua transmissão" já faz) | QP alto (H.264 > 35, VP8 > 60, AV1 > 150) com o bitrate no teto → subir o teto daquele preset; QP baixo no teto → o teto sobra |
| 6 | É o L1T3 que barra o AV1 na placa? | `codec_escolhido` ganha `av1 proc. (L1T1 placa)` quando a pergunta sem o modo diz placa e a com L1T3 não (uma pergunta a mais por tamanho de live, em cache) | L1T1 na placa → publicar AV1 sem camadas temporais nessas placas (ADR 0073, D4) |
| 7 | O congelamento em bitrate baixo é **tela parada**? | **Nenhuma coluna nova.** O painel conta à parte os congelamentos das amostras de `assiste` com menos de 1 000 bytes por quadro recebido (`bitrate_kbps × 125 / recv_fps`): a tela parada só manda quadros de repetição, de poucas centenas de bytes. Vale também para os dados já gravados | "Congelamentos por minuto" do painel desconta a tela parada; o número que sobra é o que se vê |
| 8 | Quanto tempo quem assiste espera pelo primeiro quadro? | `start_ms` na 1ª amostra de `assiste`: do "assistir" (pedido de assinatura) ao `loadeddata` do `<video>` (primeiro quadro pronto) | Espera longa → quadro-chave no começo da live (PLI ao assinar) |
| 9 | Qual decodificador (ou codificador) caiu no processador? | `decoder_software` e `encoder_software` levam o nome: `h265 · libavcodec` (o `decoderImplementation`/`encoderImplementation`, nome técnico do componente) | Lista de placas/decodificadores conhecidos em vez de detecção |
| 10 | A queda da voz coincidiu com o PC dormindo ou o app escondido? | Evento `pc_dormiu` na sessão da voz ("312 s", na hora em que acordou), do `powerMonitor` (`suspend`/`resume`) que o main da ADR 0069 já escuta. A janela escondida **não** ganha coluna: `device_samples.visible_pct` (ADR 0069) já tem, por minuto, e cruza por pessoa e horário | Queda logo depois de `pc_dormiu` não é rede: não alarmar. Queda com o app visível é rede ou servidor |
| 11 | O processamento do microfone engasga no PC de quem fala? | `dsp_underrun_pct` (call): % do tempo em que o `AudioContext` do microfone não entregou o áudio a tempo (`AudioContext.playbackStats`, `underrunDuration/totalDuration` no intervalo; nulo onde não existe) e `dsp` (call): o que estava ligado (`rnnoise`, `voz:<preset>`, `portão`) | Engasgo concentrado num preset ou numa máquina fraca → rever o custo (ADR 0005), oferecer desligar o supressor |
| 12 | A saída de áudio do PC de quem ouve falha? | `playout_synth_pct` (call): % do áudio tocado que o Chromium teve de sintetizar por falta de amostra no dispositivo de saída (`media-playout`, `synthesizedSamplesDuration/totalSamplesDuration` no intervalo; nulo se o relatório não trouxer) | Síntese na saída com a rede limpa → o dispositivo/driver de áudio de quem ouve, não a rede |
| 13 | A câmera de alguém trava ou sai ruim? | Na amostra da voz (60 s): `cam_fps`, `cam_height` e `cam_limitation` da minha câmera enviada e `cam_freezes` das câmeras que recebo (somadas) | Câmera abaixo de 15 fps com limitação `cpu` → preset menor de câmera; congelamento recebido com rede limpa → quem manda |

**Fora** (sem ação clara hoje, ou já respondido por outro sinal):

- Variância do intervalo entre quadros (`totalSquaredInterFrameDelay`): os bytes por
  quadro recebido já separam tela parada de congelamento; a variância não muda
  nenhuma decisão.
- "% de quadros com mudança" de quem transmite: o Chromium não expõe; os bytes por
  quadro respondem a mesma pergunta.
- Visibilidade da janela na amostra da voz e CPU por processo: já em `device_samples`
  (ADR 0069); repetir seria duplicar.
- Uso da placa de vídeo de quem assiste (`an-assiste` A3): o Electron não dá o uso da
  GPU por processo de forma portátil; fica para a obs-dispositivo se um dia der.
- Quanta do worklet contados × esperado (proposta da `an-chamadas`): o Chromium põe o
  áudio em dia depois de um atraso (o número de quanta acompanha o relógio mesmo com
  engasgo), então a conta não acusaria. O `playbackStats` mede o engasgo direto.
- Tipo de rede (Wi-Fi ou cabo) no desktop: não há fonte confiável (já fora na 0032).

**Como**

- Migration 000219: doze colunas nulas em `live_samples` (`qp`, `start_ms`,
  `source_width`, `source_height`, `surface`, `dsp_underrun_pct`, `dsp`,
  `playout_synth_pct`, `cam_fps`, `cam_height`, `cam_limitation`, `cam_freezes`).
  Nada em `live_sessions`. Dois tipos de evento a mais (`live_falhou`, `pc_dormiu`).
- O app lê do que já lê: o mesmo `getStats()` de 20 s (live) e de 60 s (voz); o
  `remote-inbound-rtp` e o `qpSum` vêm no relatório do envio que já é lido; o
  `media-playout` vem no relatório de cada voz recebida. A câmera é a única leitura
  nova: o `getStats()` da minha câmera e de cada câmera recebida, a cada 60 s, só
  com câmera ligada (o mesmo custo de uma voz a mais).
- Os registros ficam fora dos god stores, cada um num arquivo próprio
  (`call/lib/screenStartTelemetry.ts`, `call/lib/screenFirstFrame.ts`,
  `call/lib/micDspStats.ts`, `observability/lib/sleepLog.ts`), como o
  `screenCodecChoice` da 0032.
- O servidor aceita o formato antigo (colunas ausentes ficam nulas) e corta os
  textos novos (`surface`, `dsp`, `cam_limitation`) em listas fixas ou no tamanho.
- App Android: manda `qp`, a perda e o jitter da subida, o tamanho da fonte (da
  `media-source`), `playout_synth_pct` e o nome do componente nos eventos do
  processador; `surface`, `start_ms`, o microfone, a câmera e os dois eventos novos
  ficam nulos lá (o Android não informa a superfície, o app não processa o
  microfone, e o resto pediria código novo em `call/` do app). Ver OBSERVABILIDADE.md.

**Painel**: "Congelamentos" e congelamentos por minuto descontam a tela parada (a
sessão mostra quantos foram descontados); motivos novos nas piores sessões ("Perda
na subida de quem transmite" já vem do motivo de perda, agora preenchido; "Demorou
para entrar no ar", "Primeiro quadro demorou", "Processamento do microfone
engasga", "Saída de áudio do PC falha", "Câmera travando ou lenta"); distribuição
por superfície (monitor, janela) e por motor (nativo, Chromium); a linha de números
da sessão ganha QP, fonte e o tempo até o ar/primeiro quadro.

## Consequências

- Linhas: as mesmas (nenhuma amostra nova). Eventos: `live_falhou` só quando a live
  não começa (poucos por dia) e `pc_dormiu` uma vez por suspensão com call aberta.
  Bytes: ~30 a mais por amostra de live e ~40 por amostra de voz (com câmera e
  `dsp`), na ordem de 0,5 MB/dia no volume de hoje, ~7 MB em 14 dias.
- A câmera custa um `getStats()` por câmera ligada a cada 60 s.
- O desconto de tela parada é uma regra (1 000 bytes por quadro recebido), não uma
  medida: calibrar com a consulta do OBSERVABILIDADE.md depois de alguns dias. Amostra
  de 20 s que mistura tela parada e movimento não é descontada (conservador).
- `start_ms` de quem assiste conta do pedido de assinatura ao primeiro quadro no
  `<video>`: se a live só aparece na tela depois (miniatura fechada), o tempo inclui
  essa espera. Acima de 60 s é descartado.
- `loss_pct` de `transmite` muda de nulo para preenchido a partir desta versão.
- `playbackStats` e `media-playout` dependem do Chromium do Electron (44) e do
  navegador no app web; onde não existem, a coluna fica nula.
- Privacidade: igual à 0029 e à 0032. Só números e nomes técnicos (tipo de
  superfície, nome do componente de codec, etapa e nome do erro, os efeitos de áudio
  ligados). Nada do que se mostra (nem título de janela), fala ou escreve.

## Fontes

- W3C — WebRTC Statistics: `qpSum`, `remote-inbound-rtp` (`packetsLost`,
  `jitter`), `RTCAudioPlayoutStats` (`synthesizedSamplesDuration`,
  `totalSamplesDuration`), `decoderImplementation`: https://www.w3.org/TR/webrtc-stats/
- MDN — `AudioContext.playbackStats` / `AudioPlaybackStats` (`underrunDuration`,
  `totalDuration`; antes `playoutStats`/`fallbackFramesDuration`):
  https://developer.mozilla.org/en-US/docs/Web/API/AudioPlaybackStats
- WebRTC — captura de tela para de mandar quadros com o conteúdo parado ("zero-hertz"
  e detecção de conteúdo estático no WGC):
  https://webrtc.googlesource.com/src/+/6c453b7d59145bec2e7d3060ea373a9abcde3ef1 e
  https://bugzilla.mozilla.org/show_bug.cgi?id=1920687
- Electron — `powerMonitor` (`suspend`, `resume`): https://www.electronjs.org/docs/latest/api/power-monitor
- MDN — `MediaTrackSettings.displaySurface`:
  https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackSettings/displaySurface
- Análises `an-transmite`, `an-assiste` e `an-chamadas` (dados de 11/11 a 25/11,
  só SELECT numa cópia).
