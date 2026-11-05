import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/client', () => ({ request }))
import { createCategory, deleteCategory, deleteCategoryOverwrite, listCategories, saveCategoryLayout, setCategoryOverwrite, syncChannelWithCategory, updateCategory } from './categories'

describe('API de categorias', () => {
  beforeEach(() => request.mockReset())
  it('usa as rotas de gerenciamento do servidor', async () => {
    await listCategories('s')
    await createCategory('s', 'Jogos')
    await updateCategory('s', 'c', 'Voz')
    await deleteCategory('s', 'c')
    expect(request.mock.calls).toEqual([
      ['/servers/s/categories'],
      ['/servers/s/categories', { method: 'POST', body: '{"name":"Jogos"}' }],
      ['/servers/s/categories/c', { method: 'PUT', body: '{"name":"Voz"}' }],
      ['/servers/s/categories/c', { method: 'DELETE' }]
    ])
  })
  it('categoria privada: quem vê vai junto, ao criar e ao editar', async () => {
    const privacy = { private: true, role_ids: ['r'], member_ids: ['m'] }
    await createCategory('s', 'Jogos', privacy)
    await updateCategory('s', 'c', 'Jogos', privacy)
    const body = '{"name":"Jogos","private":true,"role_ids":["r"],"member_ids":["m"]}'
    expect(request.mock.calls).toEqual([
      ['/servers/s/categories', { method: 'POST', body }],
      ['/servers/s/categories/c', { method: 'PUT', body }]
    ])
  })
  it('regras da categoria e sincronizar o canal', async () => {
    await setCategoryOverwrite('s', 'c', 'role', 'r', 1, 2)
    await deleteCategoryOverwrite('s', 'c', 'member', 'm')
    await syncChannelWithCategory('s', 'ch')
    expect(request.mock.calls).toEqual([
      ['/servers/s/categories/c/overwrites/role/r', { method: 'PUT', body: '{"allow":1,"deny":2}' }],
      ['/servers/s/categories/c/overwrites/member/m', { method: 'DELETE' }],
      ['/servers/s/categories/channels/ch/sync', { method: 'POST' }]
    ])
  })
  it('grava a organização inteira numa rota só, com a revisão lida', async () => {
    await saveCategoryLayout('s', { categories: ['c'], channels: [{ channel_id: 'ch', category_id: 'c', position: 0 }] }, 'r1')
    expect(request).toHaveBeenCalledWith('/servers/s/categories/layout', {
      method: 'PUT',
      body: '{"categories":["c"],"channels":[{"channel_id":"ch","category_id":"c","position":0}],"revision":"r1"}'
    })
  })
})
