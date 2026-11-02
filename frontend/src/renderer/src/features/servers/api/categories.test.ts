import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/client', () => ({ request }))
import { createCategory, deleteCategory, listCategories, moveCategory, moveCategoryChannel, renameCategory } from './categories'

describe('API de categorias', () => {
  beforeEach(() => request.mockReset())
  it('usa as rotas de gerenciamento do servidor', async () => {
    await listCategories('s')
    await createCategory('s', 'Jogos')
    await renameCategory('s', 'c', 'Voz')
    await moveCategory('s', 'c', 'down')
    await deleteCategory('s', 'c')
    expect(request.mock.calls).toEqual([
      ['/servers/s/categories'],
      ['/servers/s/categories', { method: 'POST', body: '{"name":"Jogos"}' }],
      ['/servers/s/categories/c', { method: 'PUT', body: '{"name":"Voz"}' }],
      ['/servers/s/categories/c/order', { method: 'PUT', body: '{"direction":"down"}' }],
      ['/servers/s/categories/c', { method: 'DELETE' }]
    ])
  })
  it('move um canal pelo alvo, sem enviar os demais canais', async () => {
    await moveCategoryChannel('s', 'ch', 'cat', 'outro')
    expect(request).toHaveBeenCalledWith('/servers/s/categories/channels/ch', {
      method: 'PUT', body: '{"category_id":"cat","before_id":"outro"}'
    })
  })
})
