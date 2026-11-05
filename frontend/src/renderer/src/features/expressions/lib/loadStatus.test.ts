import { describe, expect, it, vi } from 'vitest'
import { startLoad } from './loadStatus'

describe('carga da lista', () => {
  it('pronta quando a carga dá certo; erro quando diz que falhou ou lança', async () => {
    const onStatus = vi.fn()
    startLoad(() => Promise.resolve(true), onStatus)
    startLoad(() => Promise.resolve(false), onStatus)
    startLoad(() => Promise.reject(new Error('rede')), onStatus)
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledTimes(3))
    expect(onStatus.mock.calls.map(([s]) => s).sort()).toEqual(['error', 'error', 'ready'])
  })

  it('cancelada (saiu da seção), não avisa', async () => {
    const onStatus = vi.fn()
    const cancel = startLoad(() => Promise.resolve(true), onStatus)
    cancel()
    await Promise.resolve()
    await Promise.resolve()
    expect(onStatus).not.toHaveBeenCalled()
  })
})
