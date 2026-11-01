import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refreshTokens = vi.fn()
vi.mock('../../../shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../shared/api/client')>()),
  refreshTokens: () => refreshTokens()
}))

import { ApiError } from '../../../shared/api/client'
import { useAuthStore } from '../../auth/store/authStore'
import { uploadThemeImage } from './appThemes'

const URL_OK = '/api/app-theme-images/0f8fad5b-d9cb-469f-a165-70867728950e'
const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('uploadThemeImage', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore.setState({ accessToken: 'velho' })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
    refreshTokens.mockReset()
  })

  it('envia o arquivo no campo "file" com o token e devolve a URL', async () => {
    fetchMock.mockResolvedValueOnce(reply(201, { url: URL_OK }))
    await expect(uploadThemeImage(new Blob(['x']))).resolves.toBe(URL_OK)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/users\/me\/app-themes\/image$/)
    expect(init.headers).toEqual({ Authorization: 'Bearer velho' })
    expect((init.body as FormData).get('file')).toBeInstanceOf(Blob)
  })

  it('token vencido: renova e tenta de novo uma vez', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'invalid token' })).mockResolvedValueOnce(reply(201, { url: URL_OK }))
    refreshTokens.mockImplementation(async () => {
      useAuthStore.setState({ accessToken: 'novo' })
      return true
    })
    await expect(uploadThemeImage(new Blob(['x']))).resolves.toBe(URL_OK)
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer novo' })
  })

  it('recusa do servidor vira ApiError com o status', async () => {
    fetchMock.mockResolvedValueOnce(reply(415, { error: 'unsupported file type' }))
    await expect(uploadThemeImage(new Blob(['x']))).rejects.toEqual(new ApiError(415, 'unsupported file type'))
    fetchMock.mockResolvedValueOnce(new Response('quebrado', { status: 500 }))
    await expect(uploadThemeImage(new Blob(['x']))).rejects.toBeInstanceOf(ApiError)
  })
})
