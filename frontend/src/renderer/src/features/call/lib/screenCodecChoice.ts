import type { ScreenCodecOptions, ScreenCodecPreference } from './screenCodec'
import type { CodecEncoder, ScreenCodecSupport, ScreenVideoCodec } from './screenCodecSupport'
import type { ScreenSound } from './screenSound'

// Por que a live saiu nesse codec (docs/adr/0032): a preferência, o que a
// placa/navegador codifica no tamanho da live, a camada extra e os codecs
// marcados como "já caiu no processador" neste aparelho. Vira o evento
// codec_escolhido da telemetria. A live nativa (helper Rust) também pode
// anotar a escolha dela aqui.

export interface CodecChoice {
  preference: ScreenCodecPreference
  support: ScreenCodecSupport
  simulcast: boolean
  codec: ScreenCodecOptions
  marked: ScreenVideoCodec[]
  /** De onde veio o som da live (a live nativa não informa). */
  sound?: ScreenSound
}

const WHERE: Record<string, string> = { hardware: 'placa', software: 'proc.' }

const where = (encoder: CodecEncoder): string => (encoder ? WHERE[encoder] : '—')

/** "auto: h264 + vp8 | av1 —, h265 proc., h264 placa | 720p extra | caiu no proc.: h265 | som: janela" */
export function describeCodecChoice(choice: CodecChoice): string {
  const { support, codec } = choice
  const backup = codec.backupCodec ? ` + ${codec.backupCodec.codec}` : ''
  const parts = [
    `${choice.preference}: ${codec.videoCodec}${backup}`,
    (['av1', 'h265', 'h264'] as const).map((c) => `${c} ${where(support[c])}`).join(', ')
  ]
  if (choice.simulcast) parts.push('720p extra')
  if (choice.marked.length > 0) parts.push(`caiu no proc.: ${choice.marked.join(', ')}`)
  if (choice.sound) parts.push(`som: ${choice.sound}`)
  return parts.join(' | ')
}

// A última escolha, até a telemetria levar (fora do callStore).
let pending: string | null = null

export function noteScreenCodecChoice(detail: string): void {
  pending = detail
}

export function takeScreenCodecChoice(): string | null {
  const out = pending
  pending = null
  return out
}
