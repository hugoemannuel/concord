# 0035. Sons do app por pessoa: pacotes sintetizados no cliente, escolhas e áudio próprio no backend

- Status: aceito
- Data: 2026-10-31

## Contexto

Issue #461: a notificação nativa tocava o som padrão do Windows (além do som do
app) e as pessoas queriam opções bem diferentes. Pedido do dono: trocar os sons
que o app toca para a própria pessoa (mensagem, menção, chamada, entrar/sair,
mutar, ensurdecer, live, sala trancada, atualização), com pacotes prontos, ajuste
por evento, volume, prévia e áudio próprio, sem afetar mais ninguém.

Forças: todos os sons do desktop já passam por `playSound` (`call/lib/sounds.ts`)
e são sintetizados na hora pelo Web Audio, sem arquivo nenhum; as escolhas devem
valer em todos os aparelhos da pessoa; o áudio próprio precisa de validação
(formato, tamanho, duração) e de um lugar no disco; os portões que já existem
(Não perturbe, servidor/canal silenciado, ensurdecido, "Som de notificação")
precisam continuar valendo.

## Opções consideradas

1. **Arquivos .ogg pré-gerados por script** (ffmpeg/sox ou Node) e servidos como
   assets: sons ricos, mas binários no repo, carregamento por rede e um caminho
   de reprodução novo só para eles.
2. **Síntese em tempo real (Web Audio), como os sons de hoje**: cada pacote é uma
   lista de notas (`Note`: frequência, início, duração, volume, onda, glissando)
   montada com timbres pequenos (quadrada 8-bit, baqueta de madeira, sino com
   parciais inarmônicos, varreduras, "blups"). Zero bytes de asset, testável como
   dado puro (duração, pico, entrar sobe/sair desce).
3. **Tocar no helper nativo (Rust)**: não ganha nada aqui; o Web Audio já toca com
   latência baixa na saída escolhida e funciona no app web, que não tem helper.

Onde guardar: (a) `localStorage`, como as preferências de notificação; (b)
backend por pessoa, num domínio pequeno (`internal/appsound`), com o arquivo na
pasta de mídia de perfil, como o som de entrada (ADR 0002).

## Decisão

Opção 2 com (b). Os pacotes (Padrão Salinha = os sons de antes, Fliperama,
Marimba, Espacial, Cristal, Bolhas e Discreto) são código em
`features/appsounds/lib/packs`, todos originais. O `playSound` ganhou uma porta
(`setSoundHandler`): o handler de `appsounds` resolve o som do evento (ajuste do
evento > pacote; `off` silencia; `custom` toca o áudio próprio com o som do pacote
de reserva) e aplica o volume (0–200%). Os sons de nível ficam fora (acompanham
a animação). O toque da chamada recebida passou a ser um som (`ring`) do
`playSound`.

As escolhas (`pack`, `volume`, `events`) e os áudios próprios (um por evento,
mp3/ogg/wav/m4a, ≤ 1 MB, 0,1–5 s medidos pelo app) ficam no backend, com cópia
local para tocar certo antes de carregar. Salvar e servir o clipe de áudio saiu
do som de entrada para `platform/media/audio.go`, usado pelos dois.

A notificação nativa (Electron) e a do navegador saem com `silent: true`: o som é
sempre o do app, uma vez só, e os portões de antes continuam decidindo se toca.

## Consequências

- Pacote novo = um arquivo em `lib/packs` e uma linha na lista; os testes
  conferem cobertura de eventos, duração (< 1,5 s) e pico.
- O servidor só confere o formato do id do pacote: um pacote que o app não
  conhece cai no padrão (versões diferentes convivem).
- Com "Som de notificação" desligado, a notificação nativa fica muda (antes
  tocava o som do sistema).
- Pendente: o app mobile (`mobile/`) ainda toca os próprios sons; portar os
  pacotes e a tela é um passo à parte. Arquivos de quem apaga a conta ficam no
  disco (como no som de entrada).

## Fontes

- MDN, Web Audio API (`OscillatorNode`, `AudioBufferSourceNode`, `decodeAudioData`):
  https://developer.mozilla.org/docs/Web/API/Web_Audio_API
- Electron, `Notification` (opção `silent`): https://www.electronjs.org/docs/latest/api/notification
- MDN, `Notification()` (opção `silent`): https://developer.mozilla.org/docs/Web/API/Notification/Notification
- Síntese de sinos por parciais inarmônicos (razões ~2,76 e ~5,4 de uma barra
  livre): https://en.wikipedia.org/wiki/Strike_tone
