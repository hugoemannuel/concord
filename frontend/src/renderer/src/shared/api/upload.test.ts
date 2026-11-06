import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refreshTokens = vi.hoisted(() => vi.fn())
vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  refreshTokens
}))

import { API_BASE_URL } from '../lib/config'
import { useAuthStore } from '../../features/auth/store/authStore'
import { ApiError } from './client'
import { FakeXhr } from './fakeXhr'
import { uploadTo } from './upload'

const file = new Blob(['oi'], { type: 'image/png' })
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('uploadTo', () => {
  beforeEach(() => {
    FakeXhr.all = []
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    useAuthStore.setState({ accessToken: 'A' })
    refreshTokens.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('manda os campos (sem os indefinidos) e os arquivos, com o token, e avisa o progresso', async () => {
    const onProgress = vi.fn()
    const promise = uploadTo<{ id: string }>(
      '/rota',
      {
        fields: { name: 'festa', emoji: undefined, duration_ms: 1500 },
        files: [
          { field: 'file', blob: file, filename: 'foto.png' },
          { field: 'static', blob: file, filename: 'foto-static' }
        ]
      },
      { onProgress }
    )
    const xhr = FakeXhr.last!
    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe(`${API_BASE_URL}/rota`)
    expect(xhr.headers['Authorization']).toBe('Bearer A')
    expect([...xhr.body!.keys()]).toEqual(['name', 'duration_ms', 'file', 'static'])
    expect(xhr.body!.get('duration_ms')).toBe('1500')
    expect((xhr.body!.get('file') as File).name).toBe('foto.png')

    xhr.progress(50, 100)
    xhr.progress(1, 0)
    xhr.progress(1, 2, false)
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith(0.5)

    xhr.respond(201, { id: 'a1' })
    await expect(promise).resolves.toEqual({ id: 'a1' })
  })

  it('sem login, vai sem Authorization e não tenta renovar', async () => {
    useAuthStore.setState({ accessToken: null })
    const promise = uploadTo('/rota', { files: [{ field: 'file', blob: file, filename: 'x' }] })
    expect(FakeXhr.last!.headers).toEqual({})
    FakeXhr.last!.respond(401, {})
    await expect(promise).rejects.toMatchObject({ status: 401 })
    expect(refreshTokens).not.toHaveBeenCalled()
  })

  it('erro do servidor vira ApiError com a mensagem, o code e o corpo', async () => {
    const promise = uploadTo('/rota', { files: [] })
    FakeXhr.last!.respond(415, { error: 'formato', code: 'unsupported_image' })
    const err = (await promise.catch((e) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(415)
    expect(err.message).toBe('formato')
    expect(err.code).toBe('unsupported_image')
    expect(err.body).toEqual({ error: 'formato', code: 'unsupported_image' })
  })

  it('erro sem code mantém o corpo', async () => {
    const promise = uploadTo('/rota', { files: [] })
    FakeXhr.last!.respond(409, { error: 'limite', max: 50 })
    const err = (await promise.catch((e) => e)) as ApiError
    expect(err.code).toBeUndefined()
    expect(err.body).toEqual({ error: 'limite', max: 50 })
  })

  it('sem mensagem no corpo (ou corpo que não é JSON) vale o texto padrão', async () => {
    const vazio = uploadTo('/rota', { files: [] })
    FakeXhr.last!.respond(500, 'quebrado')
    await expect(vazio).rejects.toMatchObject({ status: 500, message: 'Upload failed' })

    const nulo = uploadTo('/rota', { files: [] })
    FakeXhr.last!.respond(502, 'null')
    await expect(nulo).rejects.toMatchObject({ status: 502, message: 'Upload failed' })
  })

  it('quem chama escolhe os textos de erro', async () => {
    const http = vi.fn((status: number, error?: string) => `${status}:${error ?? '-'}`)
    const messages = { http, network: 'sem rede', aborted: 'cancelado' }

    const recusado = uploadTo('/rota', { files: [] }, { messages })
    FakeXhr.last!.respond(413, {})
    await expect(recusado).rejects.toMatchObject({ status: 413, message: '413:-' })
    expect(http).toHaveBeenCalledWith(413, undefined)

    const semRede = uploadTo('/rota', { files: [] }, { messages })
    FakeXhr.last!.fail()
    await expect(semRede).rejects.toMatchObject({ status: 0, message: 'sem rede' })

    const controller = new AbortController()
    const cancelado = uploadTo('/rota', { files: [] }, { messages, signal: controller.signal })
    controller.abort()
    await expect(cancelado).rejects.toMatchObject({ status: 0, message: 'cancelado' })
  })

  it('rede caiu ou cancelou: ApiError com status 0 e os textos padrão', async () => {
    const semRede = uploadTo('/rota', { files: [] })
    FakeXhr.last!.fail()
    await expect(semRede).rejects.toEqual(new ApiError(0, 'Network error'))

    const controller = new AbortController()
    const cancelado = uploadTo('/rota', { files: [] }, { signal: controller.signal })
    controller.abort()
    await expect(cancelado).rejects.toEqual(new ApiError(0, 'aborted'))
  })

  it('já cancelado: nem abre o pedido', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(uploadTo('/rota', { files: [] }, { signal: controller.signal })).rejects.toEqual(
      new ApiError(0, 'aborted')
    )
    expect(FakeXhr.all).toHaveLength(0)
  })

  it('401: renova com o token que falhou e tenta de novo uma vez', async () => {
    refreshTokens.mockImplementation(async () => {
      useAuthStore.setState({ accessToken: 'B' })
      return true
    })
    const promise = uploadTo<{ id: string }>('/rota', { files: [] })
    FakeXhr.last!.respond(401, { error: 'invalid token' })
    await settle()
    expect(refreshTokens).toHaveBeenCalledWith('A')
    expect(FakeXhr.all).toHaveLength(2)
    expect(FakeXhr.last!.headers['Authorization']).toBe('Bearer B')
    FakeXhr.last!.respond(201, { id: 'ok' })
    await expect(promise).resolves.toEqual({ id: 'ok' })
  })

  it('401 sem conseguir renovar devolve o erro', async () => {
    refreshTokens.mockResolvedValue(false)
    const promise = uploadTo('/rota', { files: [] })
    FakeXhr.last!.respond(401, { error: 'invalid token' })
    await expect(promise).rejects.toMatchObject({ status: 401, message: 'invalid token' })
    expect(FakeXhr.all).toHaveLength(1)
  })
})
