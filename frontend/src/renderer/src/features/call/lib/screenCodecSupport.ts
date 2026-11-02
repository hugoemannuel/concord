// O que a máquina de quem transmite codifica para a live, codec a codec, e
// onde: na placa de vídeo ('hardware'), no processador ('software') ou não
// codifica (null). Pergunta ao Chromium no tamanho da live e guarda a resposta
// na sessão. Ver docs/adr/0020-qualidade-das-lives.md.

export type ScreenVideoCodec = 'av1' | 'h265' | 'h264' | 'vp8'
export type CodecEncoder = 'hardware' | 'software' | null
export type ScreenCodecSupport = Record<ScreenVideoCodec, CodecEncoder>

export interface ScreenVideoShape {
  width: number
  height: number
  bitrate: number
  framerate: number
}

type SenderCapabilities = { codecs: { mimeType: string }[] } | null

interface EncodingInfoApi {
  encodingInfo(config: unknown): Promise<{ supported: boolean; powerEfficient: boolean }>
}

/**
 * H.264 como o WebRTC publica (Constrained Baseline, packetization-mode=1).
 * Sem os parâmetros o Chromium compara com packetization-mode=0, que só o
 * OpenH264 (processador) anuncia: a placa nunca era encontrada (ADR 0048).
 */
export const H264_CONTENT_TYPE = 'video/H264;profile-level-id=42e01f;packetization-mode=1'

/** Codecs que dependem da placa de vídeo e como o Chromium os chama. */
const QUERIED: {
  codec: Exclude<ScreenVideoCodec, 'vp8'>
  mime: string
  contentType: string
  mode?: string
}[] = [
  // O LiveKit publica tela em AV1 com L1T3: a pergunta inclui o modo.
  { codec: 'av1', mime: 'video/AV1', contentType: 'video/AV1', mode: 'L1T3' },
  { codec: 'h265', mime: 'video/H265', contentType: 'video/H265' },
  { codec: 'h264', mime: 'video/H264', contentType: H264_CONTENT_TYPE }
]

/**
 * Uma live nesse codec caiu no processador (ou trocou sozinha de codec): as
 * próximas o tratam como software por 7 dias. Valor = quando (ms); o "1" das
 * versões antigas, que valia para sempre, não conta mais.
 */
const softwareKey = (codec: ScreenVideoCodec): string => `salinha:screen-${codec}-software`
export const MARK_TTL_MS = 7 * 24 * 60 * 60 * 1000

const senderCapabilities = (): SenderCapabilities =>
  globalThis.RTCRtpSender?.getCapabilities?.('video') ?? null

const hasCodec = (capabilities: SenderCapabilities, mime: string): boolean =>
  !!capabilities?.codecs.some((codec) => codec.mimeType.toLowerCase() === mime.toLowerCase())

function markedSoftware(codec: ScreenVideoCodec): boolean {
  try {
    const at = Number(localStorage.getItem(softwareKey(codec)))
    // "1" (versões antigas) e lixo ficam abaixo de qualquer data recente.
    return Date.now() - at < MARK_TTL_MS
  } catch {
    return false
  }
}

/** Os codecs que já caíram no processador neste aparelho (telemetria: screenCodecChoice). */
export function softwareMarkedCodecs(): ScreenVideoCodec[] {
  return QUERIED.map((q) => q.codec).filter(markedSoftware)
}

/** powerEfficient = encoder da placa de vídeo (o Chromium responde pelo encoder da GPU). */
async function encoderOf(
  query: (typeof QUERIED)[number],
  video: ScreenVideoShape,
  api: EncodingInfoApi | undefined
): Promise<CodecEncoder> {
  if (!api || markedSoftware(query.codec)) return 'software'
  try {
    const mode = query.mode ? { scalabilityMode: query.mode } : {}
    const info = await api.encodingInfo({
      type: 'webrtc',
      video: { contentType: query.contentType, ...mode, ...video }
    })
    if (!info.supported) return null
    return info.powerEfficient ? 'hardware' : 'software'
  } catch {
    return 'software'
  }
}

export async function screenCodecSupport(
  video: ScreenVideoShape,
  api: EncodingInfoApi | undefined,
  capabilities: SenderCapabilities
): Promise<ScreenCodecSupport> {
  const support: ScreenCodecSupport = { av1: null, h265: null, h264: null, vp8: 'software' }
  for (const query of QUERIED) {
    if (hasCodec(capabilities, query.mime))
      support[query.codec] = await encoderOf(query, video, api)
  }
  return support
}

const cache = new Map<string, Promise<ScreenCodecSupport>>()

/** Detecção com cache por sessão (por tamanho/fps/bitrate da live). */
export function detectScreenCodecs(video: ScreenVideoShape): Promise<ScreenCodecSupport> {
  const key = `${video.width}x${video.height}@${video.framerate}:${video.bitrate}`
  let support = cache.get(key)
  if (!support) {
    const api = globalThis.navigator?.mediaCapabilities as EncodingInfoApi | undefined
    support = screenCodecSupport(video, api, senderCapabilities())
    cache.set(key, support)
  }
  return support
}

export function clearScreenCodecCache(): void {
  cache.clear()
}

/** Uma live nesse codec saiu pelo processador ou trocou sozinha: evitar por MARK_TTL_MS. */
export function markSoftwareCodec(codec: ScreenVideoCodec): void {
  try {
    localStorage.setItem(softwareKey(codec), String(Date.now()))
  } catch {
    /* Compartilhar continua funcionando sem armazenamento local. */
  }
  cache.clear()
}
