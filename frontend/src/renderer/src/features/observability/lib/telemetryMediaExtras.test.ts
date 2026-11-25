import { describe, expect, it } from 'vitest'
import { mediaExtras } from './telemetryMediaExtras'

const failure = { type: 'live_falhou', detail: 'publicação · TimeoutError', at: 1 }
const sleep = { type: 'pc_dormiu', detail: '312 s', at: 2 }
const sources = {
  liveStart: () => 2400,
  firstFrame: (id: string) => (id === 'bia' ? 900 : null),
  liveFailures: () => [failure],
  sleeps: () => [sleep]
}

describe('mediaExtras', () => {
  it('minha live: o tempo até o ar', () => {
    expect(mediaExtras(sources, 'transmite', '')).toEqual({ patch: { start_ms: 2400 }, events: [] })
  })
  it('live assistida: o tempo até o primeiro quadro (só da live dela)', () => {
    expect(mediaExtras(sources, 'assiste', 'bia').patch).toEqual({ start_ms: 900 })
    expect(mediaExtras(sources, 'assiste', 'caio').patch).toEqual({})
  })
  it('voz: as falhas ao começar a live e o PC que dormiu', () => {
    expect(mediaExtras(sources, 'call', '')).toEqual({ patch: {}, events: [failure, sleep] })
  })
  it('depois da 1ª amostra o tempo é levado e descartado (republicação na reconexão)', () => {
    let taken = 0
    const src = { liveStart: () => (taken++, 1800) }
    expect(mediaExtras(src, 'transmite', '', false)).toEqual({ patch: {}, events: [] })
    expect(taken).toBe(1)
  })
  it('sem as fontes (testes, app antigo): nada', () => {
    expect(mediaExtras(undefined, 'call', '')).toEqual({ patch: {}, events: [] })
    expect(mediaExtras({}, 'transmite', '')).toEqual({ patch: {}, events: [] })
  })
})
