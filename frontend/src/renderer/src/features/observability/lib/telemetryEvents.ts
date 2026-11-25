import type { SessionKind, TelemetryEvent, TelemetrySample } from './telemetryTypes'

// Eventos importantes entre duas amostras da mesma sessão (o backend grava em
// live_events; início e fim são dele). O detalhe é técnico, não é texto de UI. Puro.

/** Congelamentos somando isso no intervalo viram "congelamento longo". */
export const LONG_FREEZE_MS = 2000

/** O que a amostra não leva e os eventos precisam. */
export interface EventHints {
  /** Por que o controlador da minha live desceu (bandwidth, cpu). */
  stepReason?: string | null
}

type Rule = (
  prev: TelemetrySample | null,
  now: TelemetrySample,
  hints: EventHints
) => TelemetryEvent | null

const event = (type: string, detail = ''): TelemetryEvent => ({ type, detail })

// O motivo é o do controlador; sem ele, o qualityLimitationReason (quase sempre none).
const step: Rule = (prev, now, hints) => {
  if (prev?.step == null || now.step == null || prev.step === now.step) return null
  const detail = `${prev.step} → ${now.step}`
  const reason = hints.stepReason || now.limitation || '—'
  return now.step > prev.step
    ? event('degrau_caiu', `${detail} (${reason})`)
    : event('degrau_subiu', detail)
}

const backup: Rule = (prev, now) =>
  now.backup && !prev?.backup ? event('reserva_ligada', now.codec) : null

const software =
  (type: string): Rule =>
  (prev, now) =>
    now.hardware === false && prev?.hardware !== false ? event(type, now.codec) : null

const codec: Rule = (prev, now) =>
  prev?.codec && now.codec && prev.codec !== now.codec
    ? event('codec_trocou', `${prev.codec} → ${now.codec}`)
    : null

const freeze: Rule = (_prev, now) => {
  if (now.freeze_ms < LONG_FREEZE_MS) return null
  const seconds = (now.freeze_ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return event('congelamento_longo', `${now.freezes} congelamentos, ${seconds} s`)
}

const paused: Rule = (prev, now) =>
  now.paused && !prev?.paused ? event('pausada_pelo_servidor') : null

const RULES: Record<SessionKind, Rule[]> = {
  transmite: [step, backup, software('encoder_software'), codec],
  assiste: [software('decoder_software'), freeze, paused],
  call: []
}

export function sampleEvents(
  kind: SessionKind,
  prev: TelemetrySample | null,
  now: TelemetrySample,
  hints: EventHints = {}
): TelemetryEvent[] {
  return RULES[kind].flatMap((rule) => rule(prev, now, hints) ?? [])
}
