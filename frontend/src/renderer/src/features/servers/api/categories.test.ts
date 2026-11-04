import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/client', () => ({ request }))
import { createCategory, deleteCategory, listCategories, renameCategory, saveCategoryLayout } from './categories'

describe('API de categorias', () => {
  beforeEach(() => request.mockReset())
  it('usa as rotas de gerenciamento do servidor', async () => {
    await listCategories('s')
    await createCategory('s', 'Jogos')
    await renameCategory('s', 'c', 'Voz')
    await deleteCategory('s', 'c')
    expect(request.mock.calls).toEqual([
      ['/servers/s/categories'],
      ['/servers/s/categories', { method: 'POST', body: '{"name":"Jogos"}' }],
      ['/servers/s/categories/c', { method: 'PUT', body: '{"name":"Voz"}' }],
      ['/servers/s/categories/c', { method: 'DELETE' }]
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
