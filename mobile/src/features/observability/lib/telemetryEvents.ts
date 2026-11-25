import type { SessionKind, TelemetryEvent, TelemetrySample } from './telemetryTypes'

// Eventos importantes entre duas amostras da mesma sessão (cópia adaptada do desktop: sem degrau nem reserva,
// que o app não tem). O detalhe é técnico, não é texto de UI. Puro.

/** Congelamentos somando isso no intervalo viram "congelamento longo". */
export const LONG_FREEZE_MS = 2000

/** component: o nome do codificador/decodificador ('' sem nome). */
type Rule = (prev: TelemetrySample | null, now: TelemetrySample, component: string) => TelemetryEvent | null

const event = (type: string, detail = ''): TelemetryEvent => ({ type, detail })

/** "H265 · c2.android.hevc.decoder": o codec e, quando o WebRTC diz, qual componente caiu no processador (ADR 0074). */
const software =
  (type: string): Rule =>
  (prev, now, component) =>
    now.hardware === false && prev?.hardware !== false ? event(type, component ? `${now.codec} · ${component}` : now.codec) : null

const codec: Rule = (prev, now) =>
  prev?.codec && now.codec && prev.codec !== now.codec ? event('codec_trocou', `${prev.codec} → ${now.codec}`) : null

const freeze: Rule = (_prev, now) => {
  if (now.freeze_ms < LONG_FREEZE_MS) return null
  const seconds = (now.freeze_ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return event('congelamento_longo', `${now.freezes} congelamentos, ${seconds} s`)
}

const paused: Rule = (prev, now) => (now.paused && !prev?.paused ? event('pausada_pelo_servidor') : null)

const RULES: Record<SessionKind, Rule[]> = {
  transmite: [software('encoder_software'), codec],
  assiste: [software('decoder_software'), freeze, paused],
  call: []
}

export function sampleEvents(kind: SessionKind, prev: TelemetrySample | null, now: TelemetrySample, component = ''): TelemetryEvent[] {
  return RULES[kind].flatMap((rule) => rule(prev, now, component) ?? [])
}
