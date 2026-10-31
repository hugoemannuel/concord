import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boostRank } from '../lib/boost'
import { BOOST_EXPIRE_MS, useBoostStore } from './boostStore'

const boost = (call_id: string, percent: number, eligible = 4): void =>
  useBoostStore.getState().handleWsEvent({
    type: 'voice:boost',
    payload: { call_id, percent, eligible }
  } as never)

describe('boostStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useBoostStore.getState().reset()
  })
  afterEach(() => vi.useRealTimers())

  it('guarda o buff da call', () => {
    boost('c1', 125, 4)
    expect(useBoostStore.getState().byCall.c1).toEqual({ percent: 125, eligible: 4 })
  })

  it('percent 100 remove o buff', () => {
    boost('c1', 150, 6)
    boost('c1', 100, 3)
    expect(useBoostStore.getState().byCall.c1).toBeUndefined()
  })

  it('ignora eventos ruins', () => {
    useBoostStore.getState().handleWsEvent({ type: 'voice:boost', payload: {} } as never)
    useBoostStore.getState().handleWsEvent({ type: 'level:up', payload: {} } as never)
    expect(useBoostStore.getState().byCall).toEqual({})
    expect(useBoostStore.getState().celebration).toBeNull()
  })

  it('o buff some sozinho sem heartbeat e o heartbeat renova', () => {
    boost('c1', 125)
    vi.advanceTimersByTime(BOOST_EXPIRE_MS - 1)
    expect(useBoostStore.getState().byCall.c1).toBeDefined()
    boost('c1', 125) // heartbeat
    vi.advanceTimersByTime(BOOST_EXPIRE_MS - 1)
    expect(useBoostStore.getState().byCall.c1).toBeDefined()
    vi.advanceTimersByTime(1)
    expect(useBoostStore.getState().byCall.c1).toBeUndefined()
  })

  it('celebra ao ativar e ao subir de rank, dura o tempo do rank e some', () => {
    boost('c1', 125)
    expect(useBoostStore.getState().celebration).toMatchObject({ percent: 125, eligible: 4 })
    const first = useBoostStore.getState().celebration!.key

    vi.advanceTimersByTime(boostRank(125)!.durationMs)
    expect(useBoostStore.getState().celebration).toBeNull()

    boost('c1', 150, 6)
    expect(useBoostStore.getState().celebration).toMatchObject({ percent: 150, eligible: 6 })
    expect(useBoostStore.getState().celebration!.key).toBeGreaterThan(first)
  })

  it('heartbeat no mesmo rank, ou o buff mudando dentro do rank, não celebra de novo', () => {
    boost('c1', 400, 10)
    vi.advanceTimersByTime(boostRank(400)!.durationMs)
    boost('c1', 400, 10) // heartbeat
    boost('c1', 400, 12) // 12 pessoas ainda é SSS
    expect(useBoostStore.getState().celebration).toBeNull()
  })

  it('descer de rank não celebra', () => {
    boost('c1', 400, 10)
    vi.advanceTimersByTime(boostRank(400)!.durationMs)
    boost('c1', 250, 6)
    expect(useBoostStore.getState().celebration).toBeNull()
    expect(useBoostStore.getState().byCall.c1?.percent).toBe(250)
  })

  it('subindo D, C, B, A, S, SS e SSS, cada degrau celebra uma vez', () => {
    const ladder = [125, 150, 175, 200, 250, 300, 400]
    let lastKey = 0
    ladder.forEach((percent, i) => {
      boost('c1', percent, i + 2)
      const celebration = useBoostStore.getState().celebration
      expect(celebration, `${percent}%`).toMatchObject({ callId: 'c1', percent })
      expect(celebration!.key).toBeGreaterThan(lastKey)
      lastKey = celebration!.key
      boost('c1', percent, i + 2) // heartbeat no mesmo degrau: não repete
      expect(useBoostStore.getState().celebration!.key).toBe(lastKey)
    })
  })

  it('a prévia (dev) liga o buff e a celebração', () => {
    useBoostStore.getState().previewBoost('c9', 175)
    expect(useBoostStore.getState().byCall.c9?.percent).toBe(175)
    expect(useBoostStore.getState().celebration?.percent).toBe(175)
  })

  it('a celebração guarda a call do buff', () => {
    boost('c1', 125)
    expect(useBoostStore.getState().celebration?.callId).toBe('c1')
  })

  it('clearCall zera o buff, o timer e o banner dessa call', () => {
    boost('c1', 150, 6)
    useBoostStore.getState().clearCall('c1')
    expect(useBoostStore.getState().byCall.c1).toBeUndefined()
    expect(useBoostStore.getState().celebration).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clearCall não mexe na celebração nem no buff de outra call', () => {
    boost('c1', 125)
    boost('c2', 150, 6)
    useBoostStore.getState().clearCall('c1')
    expect(useBoostStore.getState().byCall.c2).toBeDefined()
    expect(useBoostStore.getState().celebration).toMatchObject({ callId: 'c2', percent: 150 })
  })

  it('sair e voltar à mesma call em menos de 25 s celebra a ativação de novo', () => {
    boost('c1', 125)
    vi.advanceTimersByTime(boostRank(125)!.durationMs)
    const first = useBoostStore.getState().celebration

    useBoostStore.getState().clearCall('c1') // saiu da call
    expect(useBoostStore.getState().byCall.c1).toBeUndefined()

    vi.advanceTimersByTime(5_000)
    boost('c1', 125) // voltou: o próximo heartbeat ainda traz o buff
    const again = useBoostStore.getState().celebration
    expect(first).toBeNull()
    expect(again).toMatchObject({ callId: 'c1', percent: 125 })
  })
})
