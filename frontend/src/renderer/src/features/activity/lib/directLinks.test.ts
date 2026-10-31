import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DIRECT_WAIT_MS,
  directLinksView,
  linksKey,
  loadDirectLinks,
  openListeningLink,
  waitDirectLinks
} from './directLinks'
import type { ListeningLink } from './listeningLinks'

const search: ListeningLink[] = [
  { key: 'youtube', label: 'YouTube', url: 'https://www.youtube.com/results?search_query=x' },
  { key: 'deezer', label: 'Deezer', url: 'https://www.deezer.com/search/x' }
]

afterEach(() => vi.useRealTimers())

describe('waitDirectLinks', () => {
  it('devolve os links quando chegam a tempo', async () => {
    await expect(waitDirectLinks(Promise.resolve({ deezer: 'https://www.deezer.com/track/1' }))).resolves.toEqual({
      deezer: 'https://www.deezer.com/track/1'
    })
  })

  it('desiste depois do tempo máximo (fica a busca)', async () => {
    vi.useFakeTimers()
    const p = waitDirectLinks(new Promise(() => {}))
    vi.advanceTimersByTime(DIRECT_WAIT_MS)
    await expect(p).resolves.toEqual({})
  })

  it('falha do servidor vira "sem links diretos"', async () => {
    await expect(waitDirectLinks(Promise.reject(new Error('500')))).resolves.toEqual({})
  })
})

describe('openListeningLink', () => {
  it('clique enquanto carrega: espera o link direto e abre a faixa', async () => {
    const open = vi.fn()
    await openListeningLink('youtube', search, Promise.resolve({ youtube: 'https://www.youtube.com/watch?v=abc' }), open)
    expect(open).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc')
  })

  it('sem link direto daquele serviço abre a busca', async () => {
    const open = vi.fn()
    await openListeningLink('deezer', search, Promise.resolve({ youtube: 'https://www.youtube.com/watch?v=abc' }), open)
    expect(open).toHaveBeenCalledWith('https://www.deezer.com/search/x')
  })
})

describe('loadDirectLinks', () => {
  it('pede os links, guarda a busca em andamento e entrega com a chave da faixa', async () => {
    const fetch = vi.fn().mockResolvedValue({ deezer: 'https://www.deezer.com/track/1' })
    const pending = { current: Promise.resolve({}) }
    const done = vi.fn()
    loadDirectLinks('Águas de Março', 'Elis Regina', fetch, pending, done)
    expect(fetch).toHaveBeenCalledWith('Águas de Março', 'Elis Regina')
    await expect(pending.current).resolves.toEqual({ deezer: 'https://www.deezer.com/track/1' })
    expect(done).toHaveBeenCalledWith({
      key: linksKey('Águas de Março', 'Elis Regina'),
      direct: { deezer: 'https://www.deezer.com/track/1' }
    })
  })

  it('falha vira "sem links diretos"', async () => {
    const pending = { current: Promise.resolve({}) }
    const done = vi.fn()
    loadDirectLinks('X', undefined, vi.fn().mockRejectedValue(new Error('500')), pending, done)
    await expect(pending.current).resolves.toEqual({})
    expect(done).toHaveBeenCalledWith({ key: linksKey('X'), direct: {} })
  })

  it('menu fechado (ou outra faixa) antes da resposta: não entrega', async () => {
    const pending = { current: Promise.resolve({}) }
    const done = vi.fn()
    const cancel = loadDirectLinks('X', 'Y', vi.fn().mockResolvedValue({}), pending, done)
    cancel()
    await pending.current
    expect(done).not.toHaveBeenCalled()
  })
})

describe('directLinksView', () => {
  it('carregando até chegar a resposta da faixa atual', () => {
    expect(directLinksView(null, linksKey('X'))).toEqual({ direct: {}, loading: true })
    const loaded = { key: linksKey('X'), direct: { youtube: 'https://www.youtube.com/watch?v=a' } }
    expect(directLinksView(loaded, linksKey('X'))).toEqual({ direct: loaded.direct, loading: false })
    expect(directLinksView(loaded, linksKey('Outra'))).toEqual({ direct: {}, loading: true })
  })
})
