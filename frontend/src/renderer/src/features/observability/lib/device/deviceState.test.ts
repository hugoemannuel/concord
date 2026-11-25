import { describe, expect, it } from 'vitest'
import {
  deviceLabelOf,
  leftCallOrLive,
  rowSecondsFor,
  sameLabel,
  shouldCollect
} from './deviceState'

const input = {
  status: 'idle' as const,
  isScreenSharing: false,
  watchedScreenIds: [] as string[],
  activityEnabled: true,
  detectedGame: null as unknown
}

describe('deviceLabelOf', () => {
  it('parado, sem live e sem jogo', () => {
    expect(deviceLabelOf(input)).toEqual({ state: 'parado', watching: false, game: false })
  })

  it('call ativa = call; transmitindo vence', () => {
    expect(deviceLabelOf({ ...input, status: 'active' }).state).toBe('call')
    expect(deviceLabelOf({ ...input, status: 'outgoing' }).state).toBe('parado')
    expect(deviceLabelOf({ ...input, status: 'active', isScreenSharing: true }).state).toBe(
      'transmitindo'
    )
  })

  it('assistindo alguma live', () => {
    expect(deviceLabelOf({ ...input, watchedScreenIds: ['u1'] }).watching).toBe(true)
  })

  it('jogo: sim/não só com a atividade ligada', () => {
    expect(deviceLabelOf({ ...input, detectedGame: { name: 'x' } }).game).toBe(true)
    expect(
      deviceLabelOf({ ...input, activityEnabled: false, detectedGame: { name: 'x' } }).game
    ).toBeNull()
  })
})

describe('sameLabel', () => {
  it('compara os três campos', () => {
    const a = { state: 'call' as const, watching: false, game: null }
    expect(sameLabel(a, { ...a })).toBe(true)
    expect(sameLabel(a, { ...a, watching: true })).toBe(false)
    expect(sameLabel(a, { ...a, game: false })).toBe(false)
    expect(sameLabel(a, { ...a, state: 'parado' })).toBe(false)
  })
})

describe('rowSecondsFor', () => {
  it('1 linha por minuto em call/live, a cada 5 min parado', () => {
    expect(rowSecondsFor('call')).toBe(60)
    expect(rowSecondsFor('transmitindo')).toBe(60)
    expect(rowSecondsFor('parado')).toBe(300)
  })
})

describe('leftCallOrLive', () => {
  it('saiu da live ou da call', () => {
    expect(leftCallOrLive('transmitindo', 'call')).toBe(true)
    expect(leftCallOrLive('transmitindo', 'parado')).toBe(true)
    expect(leftCallOrLive('call', 'parado')).toBe(true)
  })

  it('entrar ou continuar não conta', () => {
    expect(leftCallOrLive('parado', 'call')).toBe(false)
    expect(leftCallOrLive('call', 'transmitindo')).toBe(false)
    expect(leftCallOrLive('call', 'call')).toBe(false)
  })
})

describe('shouldCollect', () => {
  it('só com login de conta', () => {
    expect(shouldCollect(null, null)).toBe(false)
    expect(shouldCollect('tok', null)).toBe(true)
  })

  it('visitante sem conta (link de visita ativo) não manda nada', () => {
    expect(shouldCollect('tok', 'abc')).toBe(false)
  })
})
