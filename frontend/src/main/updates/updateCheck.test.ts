import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUpdateCheckGate } from './updateCheck'

/** Checagem controlada pelo teste: só termina quando `finish()` é chamado. */
function pendingCheck(): { check: ReturnType<typeof vi.fn>; finish: () => Promise<void> } {
  let resolve: () => void = () => {}
  const check = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolve = r
      })
  )
  return {
    check,
    finish: async () => {
      resolve()
      await Promise.resolve()
      await Promise.resolve()
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createUpdateCheckGate', () => {
  it('pedido de fora checa depois do debounce', () => {
    const { check } = pendingCheck()
    const gate = createUpdateCheckGate(check, 1000)
    gate.request()
    expect(check).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('rajada de pedidos vira uma checagem só', () => {
    const { check } = pendingCheck()
    const gate = createUpdateCheckGate(check, 1000)
    gate.request()
    vi.advanceTimersByTime(500)
    gate.request()
    vi.advanceTimersByTime(500)
    gate.request()
    vi.advanceTimersByTime(1000)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('pedido durante uma checagem em andamento vira uma só, logo depois dela', async () => {
    const { check, finish } = pendingCheck()
    const gate = createUpdateCheckGate(check, 1000)
    gate.run()
    gate.request()
    vi.advanceTimersByTime(1000)
    gate.request()
    vi.advanceTimersByTime(1000)
    gate.run() // periódica no meio: não empilha
    expect(check).toHaveBeenCalledTimes(1)

    // Terminou: os pedidos que chegaram no meio viram uma checagem só.
    await finish()
    expect(check).toHaveBeenCalledTimes(2)
    await finish()
    vi.advanceTimersByTime(5000)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('periódica durante a checagem em andamento não agenda outra depois', async () => {
    const { check, finish } = pendingCheck()
    const gate = createUpdateCheckGate(check, 1000)
    gate.run()
    gate.run()
    await finish()
    vi.advanceTimersByTime(5000)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('debounce que vence durante uma checagem em andamento não roda junto', async () => {
    const { check, finish } = pendingCheck()
    const gate = createUpdateCheckGate(check, 1000)
    gate.request()
    gate.run() // periódica começou antes do debounce vencer
    vi.advanceTimersByTime(1000)
    expect(check).toHaveBeenCalledTimes(1)
    await finish()
    expect(check).toHaveBeenCalledTimes(2)
    await finish()
  })

  it('checagem que falha libera a próxima', async () => {
    const check = vi.fn(async () => {
      throw new Error('offline')
    })
    const gate = createUpdateCheckGate(check, 1000)
    gate.run()
    await Promise.resolve()
    await Promise.resolve()
    gate.run()
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('quem chama run com uma checagem em andamento espera a mesma (a janelinha de abertura)', async () => {
    const { check, finish } = pendingCheck()
    const gate = createUpdateCheckGate(check, 1000)
    gate.run()
    let done = false
    void gate.run().then(() => {
      done = true
    })
    expect(check).toHaveBeenCalledTimes(1)
    await finish()
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(done).toBe(true)
  })

  it('run resolve mesmo quando a checagem falha', async () => {
    const gate = createUpdateCheckGate(() => Promise.reject(new Error('sem rede')), 1000)
    await expect(gate.run()).resolves.toBeUndefined()
  })
})
