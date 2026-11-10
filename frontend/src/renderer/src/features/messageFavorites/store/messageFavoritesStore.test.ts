import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/messageFavorites'
import { ApiError } from '../../../shared/api/client'
import { useToastStore } from '../../../shared/store/toastStore'
import { useMessageFavoritesStore } from './messageFavoritesStore'

const fav = (id: string): api.MessageFavorite => ({
  message_id: id,
  favorited_at: '2026-11-09T12:00:00Z',
  message: { id, author_id: 'u1', content: 'oi', created_at: '2026-11-09T12:00:00Z' } as never,
  origin: { server_id: 's1', channel_name: 'geral' }
})

const toasts = (): string[] => useToastStore.getState().toasts.map((t) => t.message)

describe('messageFavoritesStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useMessageFavoritesStore.setState({ ids: {}, ownerId: null, items: null, loadingList: false, listError: null })
    useToastStore.setState({ toasts: [] })
  })

  it('carrega os ids uma vez por conta', async () => {
    const spy = vi.spyOn(api, 'listMessageFavoriteIds').mockResolvedValue(['m1', 'm2'])
    const store = useMessageFavoritesStore.getState()
    await Promise.all([store.loadIds('ana'), store.loadIds('ana')])
    await useMessageFavoritesStore.getState().loadIds('ana')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(useMessageFavoritesStore.getState().ids).toEqual({ m1: true, m2: true })
  })

  it('trocar de conta recarrega do zero', async () => {
    vi.spyOn(api, 'listMessageFavoriteIds')
      .mockResolvedValueOnce(['m1'])
      .mockResolvedValueOnce(['m9'])
    await useMessageFavoritesStore.getState().loadIds('ana')
    await useMessageFavoritesStore.getState().loadIds('bia')
    expect(useMessageFavoritesStore.getState().ids).toEqual({ m9: true })
    expect(useMessageFavoritesStore.getState().ownerId).toBe('bia')
  })

  it('favoritar marca na hora, põe no topo da lista aberta e avisa', async () => {
    useMessageFavoritesStore.setState({ items: [fav('m0')] })
    vi.spyOn(api, 'addMessageFavorite').mockResolvedValue(fav('m1'))
    await useMessageFavoritesStore.getState().toggle('m1')
    const s = useMessageFavoritesStore.getState()
    expect(s.ids.m1).toBe(true)
    expect(s.items?.map((f) => f.message_id)).toEqual(['m1', 'm0'])
    expect(toasts()).toContain('Mensagem adicionada às favoritas.')
  })

  it('servidor recusa: desfaz e avisa do limite', async () => {
    vi.spyOn(api, 'addMessageFavorite').mockRejectedValue(new ApiError(409, 'cheio'))
    await useMessageFavoritesStore.getState().toggle('m1')
    expect(useMessageFavoritesStore.getState().ids.m1).toBeUndefined()
    expect(toasts()).toContain('Limite de 500 mensagens favoritas.')
  })

  it('desfavoritar tira dos ids e da lista', async () => {
    useMessageFavoritesStore.setState({ ids: { m1: true }, items: [fav('m1'), fav('m2')] })
    const spy = vi.spyOn(api, 'removeMessageFavorite').mockResolvedValue()
    await useMessageFavoritesStore.getState().toggle('m1')
    const s = useMessageFavoritesStore.getState()
    expect(spy).toHaveBeenCalledWith('m1')
    expect(s.ids.m1).toBeUndefined()
    expect(s.items?.map((f) => f.message_id)).toEqual(['m2'])
  })

  it('falha ao desfavoritar devolve o item ao lugar', async () => {
    useMessageFavoritesStore.setState({ ids: { m1: true }, items: [fav('m1')] })
    vi.spyOn(api, 'removeMessageFavorite').mockRejectedValue(new Error('rede'))
    await useMessageFavoritesStore.getState().toggle('m1')
    const s = useMessageFavoritesStore.getState()
    expect(s.ids.m1).toBe(true)
    expect(s.items?.map((f) => f.message_id)).toEqual(['m1'])
    expect(toasts()).toContain('Não foi possível remover das favoritas.')
  })

  it('carrega a lista e atualiza os ids com ela', async () => {
    vi.spyOn(api, 'listMessageFavorites').mockResolvedValue([fav('m1'), fav('m2')])
    await useMessageFavoritesStore.getState().loadList()
    const s = useMessageFavoritesStore.getState()
    expect(s.items?.length).toBe(2)
    expect(s.ids).toEqual({ m1: true, m2: true })
    expect(s.loadingList).toBe(false)
  })

  it('erro na lista fica no estado', async () => {
    vi.spyOn(api, 'listMessageFavorites').mockRejectedValue(new Error('rede'))
    await useMessageFavoritesStore.getState().loadList()
    expect(useMessageFavoritesStore.getState().listError).toBe(
      'Não foi possível carregar as favoritas.'
    )
  })
})
