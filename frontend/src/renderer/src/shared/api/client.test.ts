import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../features/auth/store/authStore'
import { API_BASE_URL } from '../lib/config'
import { ApiError, rawRequest, request } from './client'

const reply = (status: number, body?: unknown): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), { status })

describe('rawRequest', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('JSON vai com Content-Type e o token', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }))
    await expect(rawRequest('/x', { method: 'POST', body: '{}' }, 'tok')).resolves.toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API_BASE_URL}/x`)
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer tok' })
  })

  it('FormData vai sem Content-Type (o navegador põe o boundary do multipart)', async () => {
    fetchMock.mockResolvedValueOnce(reply(201, { id: 'f1' }))
    const body = new FormData()
    await rawRequest('/x', { method: 'POST', body }, 'tok')
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer tok' })
    expect(fetchMock.mock.calls[0][1].body).toBe(body)
  })

  it('headers de quem chama ficam; 204 devolve undefined', async () => {
    fetchMock.mockResolvedValueOnce(reply(204))
    await expect(rawRequest('/x', { headers: { 'X-A': '1' } })).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json', 'X-A': '1' })
  })

  it('erro vira ApiError com a mensagem, o code e o corpo', async () => {
    fetchMock.mockResolvedValueOnce(reply(409, { error: 'já existe', code: 'dup' }))
    const err = (await rawRequest('/x').catch((e) => e)) as ApiError
    expect(err).toMatchObject({ status: 409, message: 'já existe', code: 'dup' })
    expect(err.body).toEqual({ error: 'já existe', code: 'dup' })

    fetchMock.mockResolvedValueOnce(new Response('html', { status: 502 }))
    await expect(rawRequest('/x')).rejects.toMatchObject({ status: 502, message: 'Request failed' })
  })

  it('passou do tempo: ApiError 0; timeoutMs muda o limite e 0 tira', async () => {
    vi.useFakeTimers()
    const hang = (_url: string, init: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) =>
        init.signal!.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))
      )
    fetchMock.mockImplementation(hang)

    const padrao = rawRequest('/x').catch((e) => e)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await padrao).toEqual(new ApiError(0, 'Request timed out'))

    const curto = rawRequest('/x', { timeoutMs: 10 }).catch((e) => e)
    await vi.advanceTimersByTimeAsync(10)
    expect(await curto).toEqual(new ApiError(0, 'Request timed out'))
    expect(fetchMock.mock.calls[1][1]).not.toHaveProperty('timeoutMs')

    let settled = false
    void rawRequest('/x', { timeoutMs: 0 }).finally(() => (settled = true))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(settled).toBe(false)
  })

  it('erro de rede que não é timeout passa adiante', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(rawRequest('/x')).rejects.toBeInstanceOf(TypeError)
  })
})

describe('request', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    // Sem localStorage: a renovação usa os tokens em memória.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('sem storage')
      }
    })
    useAuthStore.setState({ accessToken: 'A', refreshToken: 'R' })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('401: renova e repete com o token novo (FormData continua sem Content-Type)', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(401, { error: 'invalid token' }))
      .mockResolvedValueOnce(reply(200, { access_token: 'B', refresh_token: 'R2' }))
      .mockResolvedValueOnce(reply(201, { url: '/u' }))
    const body = new FormData()
    await expect(request('/up', { method: 'POST', body })).resolves.toEqual({ url: '/u' })
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE_URL}/auth/refresh`)
    expect(fetchMock.mock.calls[2][1].headers).toEqual({ Authorization: 'Bearer B' })
    expect(useAuthStore.getState().refreshToken).toBe('R2')
  })

  it('401 com a renovação recusada devolve o 401', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, {})).mockResolvedValueOnce(reply(401, {}))
    await expect(request('/x')).rejects.toMatchObject({ status: 401 })
  })

  it('401 sem rede para renovar vira "sem conexão" (status 0)', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, {})).mockRejectedValueOnce(new TypeError('offline'))
    await expect(request('/x')).rejects.toEqual(new ApiError(0, 'Sem conexão com o servidor'))
  })

  it('sem login, o 401 passa direto', async () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null })
    fetchMock.mockResolvedValueOnce(reply(401, {}))
    await expect(request('/x')).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
