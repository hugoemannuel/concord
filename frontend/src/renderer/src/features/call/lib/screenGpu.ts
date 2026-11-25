import { gpuName } from '../../observability/lib/telemetryContext'

// A placa de vídeo deste aparelho como o WebGL conta (o mesmo nome da
// telemetria). As marcas de codec e de decodificador são guardadas com ela:
// trocar de placa ou de driver não herda a marca da outra (docs/adr/0073).

let cached: string | null = null

function readGpu(): string {
  try {
    if (typeof document === 'undefined') return ''
    const gl = document.createElement('canvas').getContext('webgl')
    return gpuName(gl as unknown as Parameters<typeof gpuName>[0])
  } catch {
    return ''
  }
}

/** Lida uma vez por abertura do app ('' = não deu para saber). */
export function screenGpu(): string {
  cached ??= readGpu()
  return cached
}

/**
 * Driver de vídeo fora do ar: o Windows desenha pelo WARP e o processo da GPU
 * do Chromium cai para software. Nada medido assim diz algo da placa de verdade.
 */
export function isBasicRenderDriver(gpu: string): boolean {
  return /Microsoft Basic Render Driver/i.test(gpu)
}
