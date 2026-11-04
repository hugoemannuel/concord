import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../../../shared/api/client'
import {
  fetchTrendingGifs,
  GifsUnavailableError,
  loadGifsConfig,
  resetGifsConfig,
  searchGifs
} from './gifs'

const config = {
  provider: 'klipy',
  app_key: 'K',
  customer_id: 'c1',
  locale: 'br',
  content_filter: 'high',
  format_filter: 'gif'
}
const H = 'https://static.klipy.com/ii/935d7ab9d8c6202580a668421940ec81/14/af'
const klipyBody = {
  result: true,
  data: {
    data: [
      { slug: 's', title: 'T', file: { md: { gif: { url: `${H}/md.gif`, width: 4, height: 3 } } } }
    ]
  }
}

function mockFetch(res: { ok?: boolean; json?: unknown } | Error): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    if (res instanceof Error) throw res
    return { ok: res.ok ?? true, json: async () => res.json }
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('GIFs pela KLIPY', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetGifsConfig()
  })

  it('pede a config ao servidor uma vez e chama a KLIPY direto, sem o token da Salinha', async () => {
    const req = vi.spyOn(client, 'request').mockResolvedValue(config)
    const fetchSpy = mockFetch({ json: klipyBody })
    const gifs = await searchGifs('gato', 20, 0)
    await fetchTrendingGifs()
    expect(req).toHaveBeenCalledTimes(1)
    expect(req).toHaveBeenCalledWith('/gifs/config')
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit | undefined]
    expect(url).toContain('https://api.klipy.com/api/v1/K/gifs/search?')
    expect(url).toContain('q=gato')
    expect(init).toBeUndefined() // nada de Authorization
    expect((fetchSpy.mock.calls[1] as unknown as [string])[0]).toContain('/gifs/trending?')
    expect(gifs[0]).toMatchObject({
      id: '935d7ab9d8c6202580a668421940ec81',
      url: `${H}/md.gif`,
      provider: 'klipy'
    })
  })

  it('config 503 (sem chave no servidor) vira GifsUnavailableError e tenta de novo depois', async () => {
    const req = vi
      .spyOn(client, 'request')
      .mockRejectedValueOnce(new client.ApiError(503, 'x'))
      .mockResolvedValue(config)
    mockFetch({ json: klipyBody })
    await expect(searchGifs('gato')).rejects.toBeInstanceOf(GifsUnavailableError)
    await expect(searchGifs('gato')).resolves.toHaveLength(1)
    expect(req).toHaveBeenCalledTimes(2)
  })

  it('falha da KLIPY (rede, status, result=false) vira GifsUnavailableError', async () => {
    vi.spyOn(client, 'request').mockResolvedValue(config)
    for (const res of [new Error('rede'), { ok: false }, { json: { result: false } }]) {
      mockFetch(res)
      await expect(fetchTrendingGifs()).rejects.toBeInstanceOf(GifsUnavailableError)
    }
  })

  it('loadGifsConfig devolve a mesma promessa enquanto deu certo', async () => {
    vi.spyOn(client, 'request').mockResolvedValue(config)
    expect(loadGifsConfig()).toBe(loadGifsConfig())
  })
})
