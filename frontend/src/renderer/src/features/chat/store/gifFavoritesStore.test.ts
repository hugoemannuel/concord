import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GiphyItem } from '../api/giphy'
import { ApiError } from '../../../shared/api/client'

const api = vi.hoisted(() => ({ server: [] as string[], failWith: null as Error | null }))

vi.mock('../api/gifFavorites', () => {
  const item = (id: string): GiphyItem => ({
    id,
    title: id,
    url: `https://media.giphy.com/media/${id}/giphy.gif`,
    preview_url: '',
    width: 1,
    height: 1
  })
  const list = (): GiphyItem[] => api.server.map(item)
  return {
    listFavoriteGifs: vi.fn(async () => list()),
    addFavoriteGif: vi.fn(async (g: GiphyItem) => {
      if (api.failWith) throw api.failWith
      if (!api.server.includes(g.id)) api.server.unshift(g.id)
      return list()
    }),
    removeFavoriteGif: vi.fn(async (id: string) => {
      if (api.failWith) throw api.failWith
      api.server = api.server.filter((x) => x !== id)
      return list()
    })
  }
})

const toastError = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/store/toastStore', () => ({ showToast: { error: toastError } }))

import { useGifFavoritesStore } from './gifFavoritesStore'

const gif = (id: string): GiphyItem => ({
  id,
  title: id,
  url: `https://media.giphy.com/media/${id}/giphy.gif`,
  preview_url: '',
  width: 1,
  height: 1
})

describe('gifFavoritesStore', () => {
  beforeEach(() => {
    api.server = []
    api.failWith = null
    toastError.mockClear()
    useGifFavoritesStore.setState({ favorites: [], ownerId: null })
  })

  it('carrega os favoritos do servidor', async () => {
    api.server = ['a', 'b']
    await useGifFavoritesStore.getState().load('u1')
    expect(useGifFavoritesStore.getState().favorites.map((g) => g.id)).toEqual(['a', 'b'])
    expect(useGifFavoritesStore.getState().ownerId).toBe('u1')
  })

  it('não busca de novo para a mesma pessoa e recarrega ao trocar de conta', async () => {
    api.server = ['a']
    const { load } = useGifFavoritesStore.getState()
    await load('u1')
    api.server = ['a', 'b']
    await load('u1')
    expect(useGifFavoritesStore.getState().favorites).toHaveLength(1)
    await load('u2')
    expect(useGifFavoritesStore.getState().favorites).toHaveLength(2)
    expect(useGifFavoritesStore.getState().ownerId).toBe('u2')
  })

  it('favorita na hora (otimista) com o mais novo primeiro e desfavorita', async () => {
    const { toggle } = useGifFavoritesStore.getState()
    await toggle(gif('a'))
    const second = toggle(gif('b'))
    expect(useGifFavoritesStore.getState().favorites.map((g) => g.id)).toEqual(['b', 'a'])
    await second
    await toggle(gif('a'))
    expect(useGifFavoritesStore.getState().favorites.map((g) => g.id)).toEqual(['b'])
  })

  it('erro desfaz a mudança e avisa', async () => {
    api.failWith = new Error('rede')
    await useGifFavoritesStore.getState().toggle(gif('a'))
    expect(useGifFavoritesStore.getState().favorites).toEqual([])
    expect(toastError).toHaveBeenCalledWith('Não foi possível favoritar o GIF.')
  })

  it('limite atingido (409) avisa o limite', async () => {
    api.failWith = new ApiError(409, 'limite')
    await useGifFavoritesStore.getState().toggle(gif('a'))
    expect(toastError).toHaveBeenCalledWith('Limite de 200 GIFs favoritos.')
  })
})
