import { describe, expect, it, vi } from 'vitest'

const requestMock = vi.fn()
vi.mock('../../../shared/api/client', () => ({
  request: (...args: unknown[]) => requestMock(...args)
}))

const { getServerLayout, saveServerLayout } = await import('./serverLayout')

describe('serverLayout API', () => {
  it('getServerLayout lê /users/me/server-layout e devolve a lista de itens', async () => {
    requestMock.mockResolvedValueOnce({ items: [{ kind: 'server', server_id: 's1' }] })
    await expect(getServerLayout()).resolves.toEqual([{ kind: 'server', server_id: 's1' }])
    expect(requestMock).toHaveBeenCalledWith('/users/me/server-layout')
  })

  it('saveServerLayout envia PUT /users/me/server-layout com os itens', async () => {
    const items = [{ kind: 'folder' as const, id: 'f1', name: 'Jogos', server_ids: ['s1'] }]
    requestMock.mockResolvedValueOnce({ items })
    await expect(saveServerLayout(items)).resolves.toEqual(items)
    expect(requestMock).toHaveBeenCalledWith('/users/me/server-layout', {
      method: 'PUT',
      body: JSON.stringify({ items })
    })
  })
})
