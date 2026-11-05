# 0049. H.264 da live na placa pelo perfil High

- Status: aceito
- Data: 2026-11-02
- Relacionado: [0015](0015-lives-em-h264.md), [0020](0020-qualidade-das-lives.md), [0048](0048-live-sem-lado-impar-e-codec-que-falha.md)

## Contexto

A ADR 0048 corrigiu a detecção do H.264 com `packetization-mode=1`, mas o
H.264 continuou no processador: reserva e H.264 manual saem em `OpenH264`.
Em 1440p60 o H.264 manual ficou em 21 fps com limitação de CPU e o controlador
desceu até 720p (quem assiste no navegador: ~5 fps).

Evidência (Windows, RTX 3070, driver 32.0.15.9186, Electron 44 / Chromium 152):

- Loopback real, codec a codec, em 2560×1440: `42e01f` = OpenH264 (~21 fps);
  `42001f`, `4d001f` e `640032` = NVIDIA H.264 Encoder MFT (55–58 fps).
  `mediaCapabilities.encodingInfo` responde igual: `42e01f` nunca é
  `powerEfficient`, os outros sempre são.
- Telemetria: em 10 sessões em H.264 com RTX 2060, 3070 e 3080, nenhuma amostra
  aparece na placa.
- O LiveKit 1.13.11 responde na oferta só `42e01f` (modos 1 e 0) e `64001f`,
  nessa ordem; o libwebrtc usa o primeiro.
- `livekit-client` 2.23 não escolhe perfil nem expõe o transceiver antes da oferta;
  a reserva nasce depois, quando um assinante pede.

## Opções testadas em live real

1. **Trocar o perfil com a live no ar** (`RTCRtpEncodingParameters.codec`). O
   codificador vai para a placa sem renegociar, mas quem assiste para de receber:
   0 fps, pedidos de quadro-chave de 1 para 119, inclusive quem entra depois. Voltar
   ao `42e01f` devolve a imagem. **Descartada.**
2. **Oferecer só o High desde a negociação (escolhida).** O servidor só conhece o
   `64001f` desde o primeiro quadro. Como principal, duas contas (app no Linux e
   navegador no Linux sem H.265) receberam 1440p a ~32 fps, sem perda e sem `codec
   changed`. Como reserva de uma live em H.265, o navegador sem H.265 recebeu 720p a
   30 fps pela placa. Atenção ao repetir: com a aba de quem assiste fora de vista, o
   app pausa o vídeo e a reserva fica sem envio (`active=false`, 0 fps), o que parece
   defeito do servidor.
3. **Mudar a lista de codecs do LiveKit** (tirar o `42e01f`). Vale para todo mundo,
   mas exige recriar o LiveKit, derruba as chamadas e quebra quem só codifica o
   `42e01f` (sem placa, e o OpenH264 não faz High).

## Decisão

- `screenCodecSupport`: pergunta o `42e01f`; se não for na placa, pergunta o
  `64001f`. O H.264 conta como `hardware` se um dos dois for. `needsHighH264` diz se a
  live precisa oferecer só o High (a placa não faz o Baseline, mas faz o High).
- `screenH264Profile`: enquanto a live pede, o `addTransceiver` de vídeo com
  `displaySurface` (tela e reserva, nunca câmera) usa `setCodecPreferences` sem os
  outros perfis de H.264. Desvio no protótipo porque o SDK não dá outra entrada. Os
  outros codecs ficam como estão, e quem já codifica o `42e01f` na placa, ou não tem
  placa, segue no padrão.
- `screenScaleSync`: a cada leitura do controlador (2 s), refaz a escala da reserva
  e da camada de 720p com o tamanho da estatística `media-source`. Antes era calculada
  só ao publicar: uma janela que alterna 1440/1438 saía em 1280×719. O `getSettings()`
  não serve: no alt-tab, o do clone da reserva seguiu em 1440 com a captura em 1438.
  Lado ímpar joga o H.264 de volta no OpenH264 enquanto durar; com lado par volta
  sozinho à placa (medido).

## Consequências

- H.264 manual, reserva e a republicação quando o H.265 falha na placa em máquinas
  como esta, com menos processador e sem a descida para 720p por CPU.
- Pode haver até 2 s de OpenH264 depois de uma mudança de tamanho, até a escala ser
  refeita.
- Com a placa, o Automático com H.264 passa a ligar a camada extra de 720p (como
  já previsto na ADR 0048).
- Quem assiste decodifica High. Testado no app e no navegador, ambos no Linux; o app
  Android ainda não foi testado.
- Uma atualização do SDK que passe a escolher perfil, ou do LiveKit que mude a lista
  de codecs, deve rever o desvio: a oferta depende de o servidor aceitar o `64001f`.

## Alternativas descartadas

- **Pedir o perfil com `munge` do SDP**: o SDK remonta o SDP e a oferta passa por vários
  caminhos internos; o `setCodecPreferences` é a API padrão para isso.
- **Mexer no privado do SDK** (`engine.pcManager.publisher`): quebra em qualquer
  atualização, e o desvio no `addTransceiver` depende só da API do WebRTC.
