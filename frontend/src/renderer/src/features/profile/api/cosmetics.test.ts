import { describe, expect, it, vi } from 'vitest'

const request = vi.fn((..._args: unknown[]) => Promise.resolve({}))
vi.mock('../../../shared/api/client', () => ({
  request: (...args: unknown[]) => request(...args),
  ApiError: class {},
  refreshTokens: vi.fn()
}))
vi.mock('../../../shared/lib/config', () => ({ API_BASE_URL: 'http://host/api' }))

const { deleteCosmetic, setNameplateMode } = await import('./users')

describe('API da faixa e da moldura', () => {
  it('setNameplateMode manda o modo', async () => {
    await setNameplateMode('banner')
    expect(request).toHaveBeenLastCalledWith('/users/me/nameplate-mode', {
      method: 'PUT',
      body: JSON.stringify({ mode: 'banner' })
    })
  })
  it('deleteCosmetic apaga a faixa ou a moldura', async () => {
    await deleteCosmetic('decoration')
    expect(request).toHaveBeenLastCalledWith('/users/me/decoration', { method: 'DELETE' })
  })
})
