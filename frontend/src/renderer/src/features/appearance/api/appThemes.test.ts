import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../shared/api/client')>()),
  request
}))

import { ApiError } from '../../../shared/api/client'
import { uploadThemeImage } from './appThemes'

const URL_OK = '/api/app-theme-images/0f8fad5b-d9cb-469f-a165-70867728950e'

// Token, renovação no 401 e multipart sem Content-Type: shared/api/client.test.ts.
describe('uploadThemeImage', () => {
  beforeEach(() => request.mockReset())

  it('envia o arquivo no campo "file", sem limite de tempo, e devolve a URL', async () => {
    request.mockResolvedValueOnce({ url: URL_OK })
    await expect(uploadThemeImage(new Blob(['x']))).resolves.toBe(URL_OK)
    const [path, init] = request.mock.calls[0]
    expect(path).toBe('/users/me/app-themes/image')
    expect(init).toMatchObject({ method: 'POST', timeoutMs: 0 })
    expect(((init.body as FormData).get('file') as File).name).toBe('fundo')
  })

  it('recusa do servidor passa adiante; resposta sem URL vira ApiError', async () => {
    request.mockRejectedValueOnce(new ApiError(415, 'unsupported file type'))
    await expect(uploadThemeImage(new Blob(['x']))).rejects.toEqual(new ApiError(415, 'unsupported file type'))
    request.mockResolvedValueOnce({})
    await expect(uploadThemeImage(new Blob(['x']))).rejects.toBeInstanceOf(ApiError)
    request.mockResolvedValueOnce(undefined)
    await expect(uploadThemeImage(new Blob(['x']))).rejects.toBeInstanceOf(ApiError)
  })
})
