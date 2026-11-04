import { ApiError, request } from '../../../shared/api/client'
import { fetchTrendingGifs, GifsUnavailableError, resetGifsConfig, searchGifs } from './gifs'

jest.mock('../../../shared/api/client', () => {
  const actual = jest.requireActual('../../../shared/api/client')
  return { ...actual, request: jest.fn() }
})

const config = { provider: 'klipy', app_key: 'K', customer_id: 'c1', locale: 'br', content_filter: 'high', format_filter: 'gif' }
const H = 'https://static.klipy.com/ii/935d7ab9d8c6202580a668421940ec81/14/af'
const klipyBody = { result: true, data: { data: [{ slug: 's', title: 'T', file: { md: { gif: { url: `${H}/md.gif`, width: 4, height: 3 } } } }] } }

function mockFetch(res: { ok?: boolean; json?: unknown } | Error): jest.Mock {
  const fn = jest.fn(async () => {
    if (res instanceof Error) throw res
    return { ok: res.ok ?? true, json: async () => res.json }
  })
  global.fetch = fn as unknown as typeof fetch
  return fn
}

describe('GIFs pela KLIPY', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetGifsConfig()
  })

  it('pede a config ao servidor uma vez e chama a KLIPY direto, sem o token da Salinha', async () => {
    jest.mocked(request).mockResolvedValue(config)
    const fetchSpy = mockFetch({ json: klipyBody })
    const gifs = await searchGifs('gato', 20, 0)
    await fetchTrendingGifs()
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/gifs/config')
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit | undefined]
    expect(url).toContain('https://api.klipy.com/api/v1/K/gifs/search?')
    expect(url).toContain('q=gato')
    expect(init).toBeUndefined()
    expect((fetchSpy.mock.calls[1] as unknown as [string])[0]).toContain('/gifs/trending?')
    expect(gifs[0]).toMatchObject({ id: '935d7ab9d8c6202580a668421940ec81', url: `${H}/md.gif`, provider: 'klipy' })
  })

  it('config 503 (sem chave no servidor) vira GifsUnavailableError e tenta de novo depois', async () => {
    jest.mocked(request).mockRejectedValueOnce(new ApiError(503, 'x')).mockResolvedValue(config)
    mockFetch({ json: klipyBody })
    await expect(searchGifs('gato')).rejects.toBeInstanceOf(GifsUnavailableError)
    await expect(searchGifs('gato')).resolves.toHaveLength(1)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('falha da KLIPY (rede, status, result=false) vira GifsUnavailableError', async () => {
    jest.mocked(request).mockResolvedValue(config)
    for (const res of [new Error('rede'), { ok: false }, { json: { result: false } }]) {
      mockFetch(res)
      await expect(fetchTrendingGifs()).rejects.toBeInstanceOf(GifsUnavailableError)
    }
  })
})
