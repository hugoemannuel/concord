import { BACKUP_HEIGHT } from './screenBackup'
import { evenScale } from './screenScale'
import { LOW_LAYER_HEIGHT } from './screenSimulcast'

// A escala das camadas reduzidas é calculada ao publicar, mas a captura muda de
// tamanho com a live no ar (janela redimensionada, alt-tab: 1440 ↔ 1438). Com a
// escala antiga sai lado ímpar (1280×719) e o H.264 volta para o processador
// até o lado ficar par. Refaz a escala a cada leitura do controlador, com o
// tamanho da estatística media-source: o getSettings() da faixa (e do clone da
// reserva) fica desatualizado. Ver docs/adr/0048 e 0049.

/** O pedaço do LocalVideoTrack do livekit-client que a escala usa. */
export interface ScaleTrack {
  sender?: RTCRtpSender
  simulcastCodecs: Map<string, { sender?: RTCRtpSender }>
}

async function capturedSize(sender: RTCRtpSender): Promise<{ width: number; height: number } | null> {
  let size: { width: number; height: number } | null = null
  ;(await sender.getStats()).forEach((stat) => {
    if (stat.type === 'media-source' && stat.kind === 'video' && stat.width && stat.height)
      size = { width: stat.width, height: stat.height }
  })
  return size
}

/** Só para a forma esperada (`layers`); a camada reduzida é sempre a primeira. */
async function syncLayer(sender: RTCRtpSender, layers: number, target: number): Promise<void> {
  const size = await capturedSize(sender)
  if (!size) return
  const parameters = sender.getParameters()
  if (parameters.encodings.length !== layers) return
  const scale = evenScale(size.width, size.height, target)
  const [layer] = parameters.encodings
  if ((layer.scaleResolutionDownBy ?? 1) === scale) return
  layer.scaleResolutionDownBy = scale
  await sender.setParameters(parameters)
}

export async function syncScreenScales(track: ScaleTrack): Promise<void> {
  if (track.sender) await syncLayer(track.sender, 2, LOW_LAYER_HEIGHT)
  for (const { sender } of track.simulcastCodecs.values()) {
    if (sender) await syncLayer(sender, 1, BACKUP_HEIGHT)
  }
}
