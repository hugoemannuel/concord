import {
  klipyIdFromUrl,
  klipyUrl,
  mapKlipyItems,
  pageOf,
  providerOfUrl,
  type GifsConfig
} from './klipy'

const config: GifsConfig = {
  provider: 'klipy',
  app_key: 'chave/com espaço',
  customer_id: 'cust-1',
  locale: 'br',
  content_filter: 'high',
  format_filter: 'gif'
}

// Formato real da doc (GET api/v1/{app_key}/gifs/search), com format_filter=gif.
const H = 'https://static.klipy.com/ii/935d7ab9d8c6202580a668421940ec81/14/af'
const body = {
  result: true,
  data: {
    data: [
      {
        id: 8041071659142944,
        slug: 'hello-hi-662',
        title: 'Hello',
        file: {
          hd: { gif: { url: `${H}/hd.gif`, width: 498, height: 498, size: 1 } },
          md: { gif: { url: `${H}/md.gif`, width: 400, height: 300, size: 1 } },
          sm: { gif: { url: `${H}/sm.gif`, width: 220, height: 165, size: 1 } },
          xs: { gif: { url: `${H}/xs.gif`, width: 90, height: 68, size: 1 } }
        },
        type: 'gif'
      }
    ],
    current_page: 1,
    per_page: 24,
    has_next: true
  }
}

describe('klipyUrl', () => {
  it('busca: rota, chave escapada no caminho e parâmetros da doc', () => {
    const u = new URL(klipyUrl(config, 25, 25, 'gato fofo'))
    expect(u.origin).toBe('https://api.klipy.com')
    expect(u.pathname).toBe('/api/v1/chave%2Fcom%20espa%C3%A7o/gifs/search')
    expect(Object.fromEntries(u.searchParams)).toEqual({
      q: 'gato fofo',
      page: '2',
      per_page: '25',
      customer_id: 'cust-1',
      locale: 'br',
      content_filter: 'high',
      format_filter: 'gif'
    })
  })

  it('sem texto é "em alta" e não leva q', () => {
    const u = new URL(klipyUrl(config, 25, 0))
    expect(u.pathname.endsWith('/gifs/trending')).toBe(true)
    expect(u.searchParams.has('q')).toBe(false)
  })

  it('per_page respeita 8..50 e a página sai do offset', () => {
    expect(pageOf(3, 0)).toEqual({ perPage: 8, page: 1 })
    expect(pageOf(500, 0)).toEqual({ perPage: 50, page: 1 })
    expect(pageOf(20, 40)).toEqual({ perPage: 20, page: 3 })
    expect(pageOf(0, -5)).toEqual({ perPage: 25, page: 1 })
  })
})

describe('mapKlipyItems', () => {
  it('converte para o formato do seletor: md na mensagem, sm na prévia, id pelo hash da URL', () => {
    expect(mapKlipyItems(body)).toEqual([
      {
        id: '935d7ab9d8c6202580a668421940ec81',
        title: 'Hello',
        url: `${H}/md.gif`,
        preview_url: `${H}/sm.gif`,
        width: 400,
        height: 300,
        provider: 'klipy'
      }
    ])
  })

  it('sem o hash na URL o id cai no slug; sem GIF ou com host de fora, o item sai', () => {
    const semHash = JSON.parse(
      JSON.stringify(body).replaceAll('/ii/935d7ab9d8c6202580a668421940ec81/14/af', '/x')
    )
    expect(mapKlipyItems(semHash)[0].id).toBe('hello-hi-662')
    const ruim = {
      data: {
        data: [
          { slug: 'a', file: { md: { webp: { url: `${H}/a.webp` } } } },
          { slug: 'b', file: { md: { gif: { url: 'https://evil.com/b.gif' } } } }
        ]
      }
    }
    expect(mapKlipyItems(ruim)).toEqual([])
    expect(mapKlipyItems({})).toEqual([])
  })
})

describe('provedores e ids', () => {
  it('hosts aceitos: GIPHY (antigo) e KLIPY, só https e sem host disfarçado', () => {
    expect(providerOfUrl('https://media3.giphy.com/media/a/giphy.gif')).toBe('giphy')
    expect(providerOfUrl('https://static2.klipy.com/ii/a/b.gif')).toBe('klipy')
    for (const u of [
      'http://static.klipy.com/a.gif',
      'https://klipy.com.evil.com/a.gif',
      'https://notklipy.com/a',
      'nada',
      ''
    ]) {
      expect(providerOfUrl(u)).toBe('')
    }
  })

  it('id da KLIPY vem do hash da URL, igual para todos os tamanhos', () => {
    expect(klipyIdFromUrl(`${H}/md.gif`)).toBe('935d7ab9d8c6202580a668421940ec81')
    expect(klipyIdFromUrl(`${H}/sm.gif`)).toBe('935d7ab9d8c6202580a668421940ec81')
    expect(klipyIdFromUrl('https://static.klipy.com/outro/formato.gif')).toBe('')
    expect(klipyIdFromUrl('https://media.giphy.com/media/abc/giphy.gif')).toBe('')
  })
})
