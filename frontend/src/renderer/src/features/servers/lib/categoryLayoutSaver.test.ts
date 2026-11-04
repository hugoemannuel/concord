import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryLayout } from '../api/categories'

const saveCategoryLayout = vi.hoisted(() => vi.fn())
vi.mock('../api/categories', () => ({ saveCategoryLayout }))
import { createCategoryLayoutSaver } from './categoryLayoutSaver'

const server: CategoryLayout = {
  categories: [{ id: 'a', name: 'A', position: 0 }],
  channels: [{ channel_id: 'c', category_id: null, position: 0 }],
  revision: 'r1'
}
const moved = (position: number): CategoryLayout => ({
  ...server,
  channels: [{ channel_id: 'c', category_id: 'a', position }]
})
const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

describe('gravar a organização', () => {
  beforeEach(() => saveCategoryLayout.mockReset())

  it('manda a revisão lida e encadeia a que o servidor devolveu', async () => {
    saveCategoryLayout.mockResolvedValueOnce({ revision: 'r2' }).mockResolvedValueOnce({ revision: 'r3' })
    const saver = createCategoryLayoutSaver('s')
    saver.confirm(server)
    const onIdle = vi.fn()
    saver.submit(moved(0), { onIdle, onFailed: vi.fn() })
    saver.submit(moved(1), { onIdle, onFailed: vi.fn() })
    expect(saver.busy()).toBe(true)
    await flush()
    expect(saveCategoryLayout.mock.calls).toEqual([
      ['s', { categories: ['a'], channels: moved(0).channels }, 'r1'],
      ['s', { categories: ['a'], channels: moved(1).channels }, 'r2']
    ])
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(saver.busy()).toBe(false)
  })

  it('recusado: entrega a última organização confirmada para voltar a ela', async () => {
    saveCategoryLayout.mockResolvedValueOnce({ revision: 'r2' }).mockRejectedValueOnce({ status: 409 })
    const saver = createCategoryLayoutSaver('s')
    saver.confirm(server)
    const callbacks = { onIdle: vi.fn(), onFailed: vi.fn() }
    saver.submit(moved(0), callbacks)
    await flush()
    saver.submit(moved(1), callbacks)
    await flush()
    expect(callbacks.onFailed).toHaveBeenCalledWith({ ...moved(0), revision: 'r2' }, { status: 409 })
  })

  it('sem nada lido ainda, a revisão vai vazia e o servidor recusa', async () => {
    saveCategoryLayout.mockRejectedValueOnce({ status: 400 })
    const saver = createCategoryLayoutSaver('s')
    const onFailed = vi.fn()
    saver.submit(moved(0), { onIdle: vi.fn(), onFailed })
    await flush()
    expect(saveCategoryLayout.mock.calls[0][2]).toBe('')
    expect(onFailed).toHaveBeenCalledWith(null, { status: 400 })
  })
})
