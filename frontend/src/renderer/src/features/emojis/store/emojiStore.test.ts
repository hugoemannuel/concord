import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/emojis'
import * as editApi from '../../expressions/api/expressions'
import { EMOTE_CATEGORIES } from '../../chat/lib/emotes'
import { resetEmojiStore, useEmojiStore } from './emojiStore'

const festa: api.CustomEmoji = {
  id: 'e1',
  server_id: 's1',
  uploader_id: 'ana',
  name: 'festa',
  content_type: 'image/png',
  size_bytes: 10,
  created_at: '2026-10-29T00:00:00Z'
}
const groups: api.ServerEmojis[] = [{ server_id: 's1', server_name: 'Alfa', emojis: [festa] }]

describe('emojiStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetEmojiStore()
  })

  it('carrega os emojis uma vez só e indexa por id', async () => {
    const fetch = vi.spyOn(api, 'fetchMyEmojis').mockResolvedValue(groups)
    await Promise.all([useEmojiStore.getState().ensureLoaded(), useEmojiStore.getState().ensureLoaded()])
    await useEmojiStore.getState().ensureLoaded()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(useEmojiStore.getState().groups).toEqual(groups)
    expect(useEmojiStore.getState().byId.e1).toEqual(festa)
  })

  it('falha ao carregar deixa tentar de novo', async () => {
    const fetch = vi.spyOn(api, 'fetchMyEmojis').mockRejectedValueOnce(new Error('rede'))
    await useEmojiStore.getState().ensureLoaded()
    fetch.mockResolvedValueOnce(groups)
    await useEmojiStore.getState().ensureLoaded()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(useEmojiStore.getState().byId.e1).toBeDefined()
  })

  it('reload busca de novo (entrou ou saiu de servidor)', async () => {
    const fetch = vi.spyOn(api, 'fetchMyEmojis').mockResolvedValue(groups)
    await useEmojiStore.getState().ensureLoaded()
    fetch.mockResolvedValue([])
    await useEmojiStore.getState().reload()
    expect(useEmojiStore.getState().byId).toEqual({})
  })

  it('reload no meio de uma carga roda outra depois (a primeira pode estar velha)', async () => {
    let finish: (g: api.ServerEmojis[]) => void = () => {}
    const fetch = vi
      .spyOn(api, 'fetchMyEmojis')
      .mockImplementationOnce(() => new Promise((r) => (finish = r)))
      .mockResolvedValueOnce(groups)
    const first = useEmojiStore.getState().reload()
    void useEmojiStore.getState().reload()
    finish([])
    await first
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(useEmojiStore.getState().byId.e1).toBeDefined())
  })

  it('pack base: usa o do servidor e, se falhar, o local', async () => {
    vi.spyOn(api, 'fetchBasePack').mockResolvedValueOnce({
      groups: [{ id: 0, name: 'sorrisos' }],
      emojis: [{ e: '😀', l: 'rosto', g: 0 }]
    })
    await useEmojiStore.getState().ensureBase()
    expect(useEmojiStore.getState().base?.[1].items[0].emoji).toBe('😀')

    resetEmojiStore()
    vi.spyOn(api, 'fetchBasePack').mockRejectedValueOnce(new Error('502'))
    await useEmojiStore.getState().ensureBase()
    expect(useEmojiStore.getState().base).toBe(EMOTE_CATEGORIES)
  })

  it('upload e remove atualizam o grupo do servidor', async () => {
    vi.spyOn(api, 'fetchMyEmojis').mockResolvedValue(groups)
    await useEmojiStore.getState().ensureLoaded()
    const kkk = { ...festa, id: 'e2', name: 'kkk' }
    vi.spyOn(api, 'uploadServerEmoji').mockResolvedValue(kkk)
    await useEmojiStore.getState().upload('s1', 'kkk', new Blob())
    expect(useEmojiStore.getState().groups[0].emojis.map((e) => e.id)).toEqual(['e1', 'e2'])

    vi.spyOn(api, 'deleteServerEmoji').mockResolvedValue()
    await useEmojiStore.getState().remove('s1', 'e1')
    expect(useEmojiStore.getState().byId.e1).toBeUndefined()
    expect(useEmojiStore.getState().groups[0].emojis.map((e) => e.id)).toEqual(['e2'])
  })

  it('eventos do ws: criado (sem repetir) e apagado', async () => {
    vi.spyOn(api, 'fetchMyEmojis').mockResolvedValue(groups)
    await useEmojiStore.getState().ensureLoaded()
    const kkk = { ...festa, id: 'e2', name: 'kkk' }
    const { handleWsEvent } = useEmojiStore.getState()
    handleWsEvent({ type: 'emoji:created', payload: { server_id: 's1', emoji: kkk } })
    handleWsEvent({ type: 'emoji:created', payload: { server_id: 's1', emoji: kkk } })
    expect(useEmojiStore.getState().groups[0].emojis).toHaveLength(2)
    handleWsEvent({ type: 'emoji:deleted', payload: { server_id: 's1', emoji_id: 'e1' } })
    expect(Object.keys(useEmojiStore.getState().byId)).toEqual(['e2'])
  })

  it('rename troca o nome no grupo e no índice', async () => {
    vi.spyOn(api, 'fetchMyEmojis').mockResolvedValue(groups)
    await useEmojiStore.getState().ensureLoaded()
    const renamed = { ...festa, name: 'festao' }
    const update = vi.spyOn(editApi, 'updateServerEmoji').mockResolvedValue(renamed)
    await expect(useEmojiStore.getState().rename('s1', 'e1', 'festao')).resolves.toEqual(renamed)
    expect(update).toHaveBeenCalledWith('s1', 'e1', 'festao')
    expect(useEmojiStore.getState().byId.e1.name).toBe('festao')
    expect(useEmojiStore.getState().groups[0].emojis).toEqual([renamed])
  })

  it('emoji:updated troca o emoji; de um que não está na lista, nada muda', async () => {
    vi.spyOn(api, 'fetchMyEmojis').mockResolvedValue(groups)
    await useEmojiStore.getState().ensureLoaded()
    const { handleWsEvent } = useEmojiStore.getState()
    expect(handleWsEvent({ type: 'emoji:updated', payload: { server_id: 's1', emoji: { ...festa, name: 'novo' } } })).toBe(
      true
    )
    expect(useEmojiStore.getState().byId.e1.name).toBe('novo')
    const before = useEmojiStore.getState().groups
    handleWsEvent({ type: 'emoji:updated', payload: { server_id: 's1', emoji: { ...festa, id: 'e9' } } })
    expect(useEmojiStore.getState().groups).toBe(before)
  })

  it('emoji de servidor que ainda não tinha grupo recarrega a lista', async () => {
    const fetch = vi.spyOn(api, 'fetchMyEmojis').mockResolvedValue(groups)
    await useEmojiStore.getState().ensureLoaded()
    useEmojiStore.getState().handleWsEvent({
      type: 'emoji:created',
      payload: { server_id: 's2', emoji: { ...festa, id: 'e9', server_id: 's2' } }
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('evento antes de carregar é ignorado (a carga já traz)', () => {
    useEmojiStore.getState().handleWsEvent({ type: 'emoji:created', payload: { server_id: 's1', emoji: festa } })
    expect(useEmojiStore.getState().groups).toEqual([])
  })
})
