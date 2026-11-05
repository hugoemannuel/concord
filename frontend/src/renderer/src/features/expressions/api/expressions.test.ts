import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/client', () => ({ request }))

import { updateServerEmoji, updateServerSound, updateServerSticker } from './expressions'

describe('api de edição das expressões', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue({ id: 'x' })
  })

  it('emoji: PATCH com o nome novo', async () => {
    await expect(updateServerEmoji('s 1', 'e1', 'festa')).resolves.toEqual({ id: 'x' })
    expect(request).toHaveBeenCalledWith('/servers/s%201/emojis/e1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'festa' })
    })
  })

  it('figurinha: PATCH com o nome sem os espaços das pontas', async () => {
    await updateServerSticker('s1', 'k1', '  risada ')
    expect(request).toHaveBeenCalledWith('/servers/s1/stickers/k1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'risada' })
    })
  })

  it('som: PATCH com nome e emoji (vazio limpa)', async () => {
    await updateServerSound('s1', 'd1', { name: ' Corneta ', emoji: '' })
    expect(request).toHaveBeenCalledWith('/servers/s1/soundboard/d1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Corneta', emoji: '' })
    })
  })
})
