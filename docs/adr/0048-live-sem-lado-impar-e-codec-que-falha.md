# 0048. Live sem lado ímpar e republicação quando o codec falha

- Status: aceito
- Data: 2026-11-02
- Relacionado: [0015](0015-lives-em-h264.md), [0020](0020-qualidade-das-lives.md), [0032](0032-sinais-de-qualidade-das-lives-e-calls.md)

## Contexto

Relato do dono (Windows, RTX 3070, 0.6.79): live **preta** para quem assiste
com o codec no Automático; o painel "Sua transmissão" mostrava `VP8 ·
processador` numa live publicada em H.265. E com H.264 escolhido à mão, H.264
pelo processador.

Evidência:

- LiveKit (02/11): a tela publicada como `video/H265` (reserva H.264) e, ~5 s
  depois, `codec changed` nas duas camadas: `H265 → VP8` (payload 49 → 96). 50
  vezes em 6 h. Quem assiste negociou H.265 e passa a receber VP8.
- Telemetria (todas as lives de Windows desde 30/10): das lives em H.265,
  **0 de 9 numa camada só** trocaram de codec; **9 de 44 com a camada extra de
  720p** trocaram. Com tamanho de captura fora de múltiplo de 4 (janelas:
  2560×1438, 1918×802, 1538×864…), **6 de 8** trocaram; nos 16:9 limpos, 3 de 36.
- Chromium (`media_foundation_video_encode_accelerator_win.cc`): o
  codificador da placa no Windows recusa largura/altura ímpar
  (`IsFrameSizeAllowed` → `kEncoderUnsupportedConfig`), no início e na troca de
  tamanho. `rtc_video_encoder.cc`: H.264 de lado ímpar vai direto para o
  software (OpenH264); H.265 não tem software, então o libwebrtc troca de codec
  na mesma faixa (o próximo negociado, VP8). O alinhamento par que o codificador
  pede só é conhecido depois da primeira inicialização.
- A camada extra e a reserva usavam `scaleResolutionDownBy = lado menor / 720`:
  2560×1438 → 1281×720 (ímpar). A captura do Chromium sai sempre par.
- Detecção: `mediaCapabilities.encodingInfo` com `video/H264` sem parâmetros é
  comparado com `packetization-mode=0`, que só o OpenH264 anuncia
  (`H264IsSamePacketizationMode`). Todas as máquinas Windows apareciam com
  "h264 proc.", inclusive RTX 3080/4060.
- `WebRtcScreenshareSwEncoding` vem desligada e só vale para VP8 com camadas
  temporais: não é a causa.

## Decisão

1. **Lados pares** (`screenScale.ts`): a camada de 720p (preset passado ao
   LiveKit e troca de degrau) e a reserva usam a escala que dá largura e altura
   pares depois do truncamento do libwebrtc.
2. **H.265 numa camada só**, como o AV1: com a camada extra de 720p o H.265 é
   pulado (vai o H.264); no Automático a camada extra não liga com H.265. Quem
   tem internet fraca recebe a reserva H.264 em 720p30. Flag de teste para
   voltar a combinar: `localStorage['salinha:screen-h265-720p-extra'] = '1'`.
3. **Rede de segurança** (`screenCodecGuard.ts` + `ScreenSender`): a cada
   leitura do controlador (2 s), se o codec que sai difere do publicado em duas
   leituras seguidas, marca o codec neste aparelho e republica só o vídeo no
   próximo seguro (H.264, depois VP8). Quem assiste assina a nova publicação
   sozinho. O painel mostra "H.265 falhou, usando H.264".
4. **Marcas com prazo**: `salinha:screen-<codec>-software` guarda a data e vale
   7 dias; o `1` das versões antigas (que valia para sempre) é ignorado.
5. **Detecção do H.264** perguntada como o WebRTC publica:
   `video/H264;profile-level-id=42e01f;packetization-mode=1`.

## Alternativas descartadas

- **Restringir os codecs da faixa a só H.265** (`setCodecPreferences`): sem
  outro codec o libwebrtc não troca, mas o vídeo para do mesmo jeito; quem
  assiste fica sem imagem. O LiveKit gerencia as preferências; mexer nelas é
  frágil.
- **Quem assiste pedir a reserva ao ver tela preta**: o SDK não deixa o
  assinante escolher a reserva (o SFU decide pelo que ele decodifica). A
  republicação de quem transmite resolve em ~4 s para todo mundo.
- **Codificador nativo (helper Rust) para H.265 no Windows**: ganho só se o
  navegador não conseguisse; com lados pares e uma camada o codificador da placa
  do Chromium funciona. Fica para o marco da live nativa no Windows.

## Consequências

- Live em H.265 sem a camada de 720p em H.265: um codificador a menos na placa.
- Uma republicação troca o SID da tela (~1 s sem imagem para quem assiste), em
  vez de tela preta até o fim.
- O H.264 passa a ser detectado na placa; o Automático com H.264 liga a camada
  extra quando ele é o codec da live.
