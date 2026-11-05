import { beforeEach, describe, expect, it, vi } from 'vitest'

const getInvitePreview = vi.fn()
vi.mock('../api/invites', () => ({ getInvitePreview: (...a: unknown[]) => getInvitePreview(...a) }))

import { useInvitePreviewCache } from './invitePreviewCacheStore'

const preview = { name: 'Salinha', member_count: 3, online_count: 1, server_id: 's1' }
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('invitePreviewCacheStore', () => {
  beforeEach(() => {
    getInvitePreview.mockReset()
    useInvitePreviewCache.getState().reset()
  })

  it('busca a prévia logado uma vez só por código', async () => {
    getInvitePreview.mockResolvedValue(preview)
    const { ensure } = useInvitePreviewCache.getState()
    ensure('ABCD')
    ensure('ABCD')
    expect(useInvitePreviewCache.getState().entries.ABCD).toEqual({ status: 'loading' })
    await flush()
    ensure('ABCD')
    expect(getInvitePreview).toHaveBeenCalledTimes(1)
    expect(getInvitePreview).toHaveBeenCalledWith('ABCD', true)
    expect(useInvitePreviewCache.getState().entries.ABCD).toEqual({ status: 'ready', preview })
  })

  it('convite inválido (404) fica guardado como erro', async () => {
    getInvitePreview.mockRejectedValue({ status: 404 })
    useInvitePreviewCache.getState().ensure('XXXX')
    await flush()
    useInvitePreviewCache.getState().ensure('XXXX')
    expect(getInvitePreview).toHaveBeenCalledTimes(1)
    expect(useInvitePreviewCache.getState().entries.XXXX).toMatchObject({
      status: 'error',
      message: 'Este convite é inválido ou expirou.'
    })
  })

  it('falha passageira (limite, rede) tenta de novo na próxima vez', async () => {
    getInvitePreview.mockRejectedValueOnce({ status: 429 }).mockResolvedValueOnce(preview)
    useInvitePreviewCache.getState().ensure('ABCD')
    await flush()
    useInvitePreviewCache.getState().ensure('ABCD')
    await flush()
    expect(getInvitePreview).toHaveBeenCalledTimes(2)
    expect(useInvitePreviewCache.getState().entries.ABCD).toEqual({ status: 'ready', preview })
  })
})
