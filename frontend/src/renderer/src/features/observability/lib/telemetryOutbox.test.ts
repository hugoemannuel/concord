import { describe, expect, it } from 'vitest'
import { emptySample, type ClientContext } from './telemetryTypes'
import {
  createOutbox,
  OUTBOX_MAX,
  OUTBOX_MAX_AGE_MS,
  retryable,
  toWire,
  type Draft
} from './telemetryOutbox'

const draft = (at: number, extra: Partial<Draft> = {}): Draft => ({
  session_id: `s-${at}`,
  kind: 'call',
  call_id: 'c1',
  streamer_id: '',
  sample: emptySample(),
  events: [],
  ended: false,
  at,
  ...extra
})

const context: ClientContext = {
  os: 'Linux',
  app_version: '1',
  target: 'desktop',
  gpu: '',
  network: '',
  cores: 4
}

describe('retryable', () => {
  it('só o que tem evento ou fim, e sem a amostra', () => {
    expect(retryable(draft(0))).toBeNull()
    expect(retryable(draft(0, { ended: true }))).toMatchObject({ ended: true, sample: null })
    const withEvent = retryable(draft(0, { events: [{ type: 'reconectou', detail: '3 s' }] }))
    expect(withEvent?.sample).toBeNull()
    expect(withEvent?.events).toHaveLength(1)
  })
})

describe('createOutbox', () => {
  it('guarda até levarem; amostra sozinha não espera', () => {
    const box = createOutbox()
    box.keep([draft(1), draft(2, { ended: true })])
    expect(box.take(10).map((d) => d.session_id)).toEqual(['s-2'])
    expect(box.take(10)).toEqual([])
  })

  it(`no máximo ${OUTBOX_MAX}, os mais novos; o mais velho que 15 min some`, () => {
    const box = createOutbox()
    box.keep(Array.from({ length: OUTBOX_MAX + 5 }, (_, i) => draft(i, { ended: true })))
    const kept = box.take(OUTBOX_MAX_AGE_MS + 6)
    expect(kept).toHaveLength(OUTBOX_MAX - 1)
    expect(kept[0].session_id).toBe('s-6')
  })
})

describe('toWire', () => {
  it('há quanto tempo: o relatório pela hora dele, cada evento pela sua', () => {
    const d = draft(1000, {
      events: [{ type: 'reconectou', detail: '3 s', at: 400 }, { type: 'degrau_caiu', detail: '0 → 1' }]
    })
    expect(toWire(d, context, 61_000)).toMatchObject({
      context,
      ago_ms: 60_000,
      events: [
        { type: 'reconectou', detail: '3 s', ago_ms: 60_600 },
        { type: 'degrau_caiu', detail: '0 → 1', ago_ms: 60_000 }
      ]
    })
    expect(toWire(d, context, 61_000)).not.toHaveProperty('at')
    expect(toWire(d, context, 61_000).events[0]).not.toHaveProperty('at')
  })
})
