// O que a máquina de quem transmite codifica para a live, codec a codec, e
// onde: na placa de vídeo ('hardware'), no processador ('software') ou não
// codifica (null). Pergunta ao Chromium no tamanho da live e guarda a resposta
// na sessão. Ver docs/adr/0020-qualidade-das-lives.md.

import { H264_HIGH_CONTENT_TYPE } from './screenH264Profile'
import { isBasicRenderDriver, screenGpu } from './screenGpu'

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
 * H.264 como o WebRTC publica por padrão (Constrained Baseline,
 * packetization-mode=1). Sem os parâmetros o Chromium compara com
 * packetization-mode=0, que só o OpenH264 (processador) anuncia (ADR 0048).
 */
export const H264_CONTENT_TYPE = 'video/H264;profile-level-id=42e01f;packetization-mode=1'

/** Codecs que dependem da placa de vídeo e como o Chromium os chama. */
const QUERIED: {
  codec: Exclude<ScreenVideoCodec, 'vp8'>
  mime: string
  contentType: string
  mode?: string
  /** Outro perfil do codec que a live consegue usar, se o padrão não for na placa. */
  hardwareProfile?: string
}[] = [
  // O LiveKit publica tela em AV1 com L1T3: a pergunta inclui o modo.
  { codec: 'av1', mime: 'video/AV1', contentType: 'video/AV1', mode: 'L1T3' },
  { codec: 'h265', mime: 'video/H265', contentType: 'video/H265' },
  // Windows: o 42e01f é só OpenH264; a placa fica no High (ADR 0049).
  {
    codec: 'h264',
    mime: 'video/H264',
    contentType: H264_CONTENT_TYPE,
    hardwareProfile: H264_HIGH_CONTENT_TYPE
  }
]

/**
 * Uma live nesse codec caiu no processador (ou trocou sozinha de codec): as
 * próximas o tratam como software por 7 dias, contados da primeira queda, e só
 * na mesma placa de vídeo. Valor = `{"at": ms, "gpu": "..."}`; as marcas antigas
 * (só a data, ou o "1") não contam: a data se renovava a cada leitura (ADR 0073).
 */
const softwareKey = (codec: ScreenVideoCodec): string => `salinha:screen-${codec}-software`
export const MARK_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface SoftwareMark {
  at: number
  gpu: string
}

function readMark(codec: ScreenVideoCodec): SoftwareMark | null {
  try {
    const value = JSON.parse(localStorage.getItem(softwareKey(codec)) ?? 'null') as unknown
    if (typeof value !== 'object' || value === null) return null
    const { at, gpu } = value as Partial<SoftwareMark>
    return typeof at === 'number' && typeof gpu === 'string' ? { at, gpu } : null
  } catch {
    return null
  }
}

function markedSoftware(codec: ScreenVideoCodec, gpu: string): boolean {
  const mark = readMark(codec)
  return mark !== null && mark.gpu === gpu && Date.now() - mark.at < MARK_TTL_MS
}

const senderCapabilities = (): SenderCapabilities =>
  globalThis.RTCRtpSender?.getCapabilities?.('video') ?? null

const hasCodec = (capabilities: SenderCapabilities, mime: string): boolean =>
  !!capabilities?.codecs.some((codec) => codec.mimeType.toLowerCase() === mime.toLowerCase())

/** Os codecs que já caíram no processador neste aparelho (telemetria: screenCodecChoice). */
export function softwareMarkedCodecs(gpu = screenGpu()): ScreenVideoCodec[] {
  return QUERIED.map((q) => q.codec).filter((codec) => markedSoftware(codec, gpu))
}

function ask(
  api: EncodingInfoApi,
  contentType: string,
  video: ScreenVideoShape,
  mode?: string
): Promise<{ supported: boolean; powerEfficient: boolean }> {
  const scalability = mode ? { scalabilityMode: mode } : {}
  return api.encodingInfo({ type: 'webrtc', video: { contentType, ...scalability, ...video } })
}

/** powerEfficient = encoder da placa de vídeo (o Chromium responde pelo encoder da GPU). */
async function encoderOf(
  query: (typeof QUERIED)[number],
  video: ScreenVideoShape,
  api: EncodingInfoApi | undefined,
  gpu: string
): Promise<CodecEncoder> {
  if (!api || markedSoftware(query.codec, gpu)) return 'software'
  try {
    const info = await ask(api, query.contentType, video, query.mode)
    if (!info.supported) return null
    if (info.powerEfficient) return 'hardware'
    if (!query.hardwareProfile) return 'software'
    const other = await ask(api, query.hardwareProfile, video)
    return other.powerEfficient ? 'hardware' : 'software'
  } catch {
    return 'software'
  }
}

/**
 * O AV1 sem camadas temporais (L1T1) sai na placa quando o L1T3 do LiveKit
 * não sai? Só pergunta nesse caso (telemetria, ADR 0074): undefined = não
 * perguntou ou não deu para saber.
 */
export async function av1WithoutLayers(
  video: ScreenVideoShape,
  api: EncodingInfoApi | undefined,
  support: ScreenCodecSupport
): Promise<CodecEncoder | undefined> {
  if (!api || support.av1 === null || support.av1 === 'hardware') return undefined
  try {
    return (await ask(api, 'video/AV1', video, 'L1T1')).powerEfficient ? 'hardware' : 'software'
  } catch {
    return undefined
  }
}

const plainAv1Cache = new Map<string, Promise<CodecEncoder | undefined>>()

/** Com cache por sessão, como a detecção (limpo junto com ela). */
export function detectAv1WithoutLayers(
  video: ScreenVideoShape,
  support: ScreenCodecSupport
): Promise<CodecEncoder | undefined> {
  const key = `${video.width}x${video.height}@${video.framerate}:${video.bitrate}:${support.av1}`
  let answer = plainAv1Cache.get(key)
  if (!answer) {
    const api = globalThis.navigator?.mediaCapabilities as EncodingInfoApi | undefined
    answer = av1WithoutLayers(video, api, support)
    plainAv1Cache.set(key, answer)
  }
  return answer
}

/** A placa só codifica o H.264 no High? Então a live precisa oferecer só ele. */
export async function needsHighH264(
  video: ScreenVideoShape,
  api: EncodingInfoApi | undefined,
  gpu = screenGpu()
): Promise<boolean> {
  if (!api || markedSoftware('h264', gpu)) return false
  try {
    if ((await ask(api, H264_CONTENT_TYPE, video)).powerEfficient) return false
    return (await ask(api, H264_HIGH_CONTENT_TYPE, video)).powerEfficient
  } catch {
    return false
  }
}

export function detectHighH264(video: ScreenVideoShape): Promise<boolean> {
  return needsHighH264(video, globalThis.navigator?.mediaCapabilities as EncodingInfoApi | undefined)
}

export async function screenCodecSupport(
  video: ScreenVideoShape,
  api: EncodingInfoApi | undefined,
  capabilities: SenderCapabilities,
  gpu = screenGpu()
): Promise<ScreenCodecSupport> {
  const support: ScreenCodecSupport = { av1: null, h265: null, h264: null, vp8: 'software' }
  for (const query of QUERIED) {
    if (hasCodec(capabilities, query.mime))
      support[query.codec] = await encoderOf(query, video, api, gpu)
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
  plainAv1Cache.clear()
}

/**
 * Uma live nesse codec saiu pelo processador ou trocou sozinha: evitar por
 * MARK_TTL_MS. Marca vigente fica como está (a validade conta da primeira
 * queda), e com o driver de vídeo fora do ar não marca: a placa não teve culpa.
 */
export function markSoftwareCodec(codec: ScreenVideoCodec, gpu = screenGpu()): void {
  if (isBasicRenderDriver(gpu) || markedSoftware(codec, gpu)) return
  try {
    const mark: SoftwareMark = { at: Date.now(), gpu }
    localStorage.setItem(softwareKey(codec), JSON.stringify(mark))
  } catch {
    /* Compartilhar continua funcionando sem armazenamento local. */
  }
  clearScreenCodecCache()
}
