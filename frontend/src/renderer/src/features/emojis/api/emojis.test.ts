import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/lib/config', () => ({ API_BASE_URL: 'https://api' }))
vi.mock('../../../shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../shared/api/client')>()),
  request
}))

import { ApiError } from '../../../shared/api/client'
import { emojiFileUrl, uploadServerEmoji } from './emojis'

// Token, renovação no 401 e multipart sem Content-Type: shared/api/client.test.ts.
describe('api de emojis', () => {
  beforeEach(() => request.mockReset())

  it('URL do arquivo leva o media token', () => {
    expect(emojiFileUrl('e 1', 't&x')).toBe('https://api/emojis/e%201/file?token=t%26x')
  })

  it('envia nome e arquivo em multipart, sem limite de tempo', async () => {
    request.mockResolvedValueOnce({ id: 'e1', name: 'festa' })
    const created = await uploadServerEmoji('s 1', 'festa', new Blob(['x']))
    expect(created).toMatchObject({ id: 'e1' })
    const [path, init] = request.mock.calls[0]
    expect(path).toBe('/servers/s%201/emojis')
    expect(init).toMatchObject({ method: 'POST', timeoutMs: 0 })
    expect((init.body as FormData).get('name')).toBe('festa')
    expect(((init.body as FormData).get('file') as File).name).toBe('emoji')
  })

  it('erro do servidor passa adiante com a mensagem dele', async () => {
    request.mockRejectedValueOnce(new ApiError(409, 'Este servidor já tem 50 emojis.'))
    await expect(uploadServerEmoji('s1', 'festa', new Blob())).rejects.toMatchObject({
      status: 409,
      message: 'Este servidor já tem 50 emojis.'
    })
  })
})
