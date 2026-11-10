import { beforeEach, describe, expect, it } from 'vitest'
import { useSlowmodeStore } from './slowmodeStore'

describe('slowmodeStore', () => {
  beforeEach(() => useSlowmodeStore.setState({ until: {} }))

  it('guarda até quando cada sala está travada', () => {
    useSlowmodeStore.getState().block('channel:a', 30, 1000)
    expect(useSlowmodeStore.getState().until).toEqual({ 'channel:a': 31_000 })
  })

  it('não encurta uma espera maior que já existe', () => {
    useSlowmodeStore.getState().block('channel:a', 30, 0)
    useSlowmodeStore.getState().block('channel:a', 5, 1000)
    expect(useSlowmodeStore.getState().until['channel:a']).toBe(30_000)
  })

  it('sem horário usa o relógio', () => {
    const before = Date.now()
    useSlowmodeStore.getState().block('channel:b', 10)
    expect(useSlowmodeStore.getState().until['channel:b']).toBeGreaterThanOrEqual(before + 10_000)
  })
})
