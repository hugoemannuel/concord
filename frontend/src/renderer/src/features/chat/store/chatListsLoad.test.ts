import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { useAuthStore, type User } from '../../auth/store/authStore'
import type { ChatState } from './chatStore'

const api = vi.hoisted(() => ({
  listConversations: vi.fn(),
  fetchPresence: vi.fn(),
  fetchActivities: vi.fn(),
  listChannels: vi.fn(),
  applyFetched: vi.fn()
}))
vi.mock('../api/conversations', () => ({ listConversations: api.listConversations }))
vi.mock('../../friends/api/presence', () => ({
  fetchPresence: api.fetchPresence,
  fetchActivities: api.fetchActivities
}))
vi.mock('../../servers/api/channels', () => ({ listChannels: api.listChannels }))
vi.mock('../../activity/store/presenceActivityStore', () => ({
  usePresenceActivityStore: { getState: () => ({ applyFetched: api.applyFetched }) }
}))

const { chatListActions } = await import('./chatListsLoad')

const IDLE = {
  unreadByRoom: {},
  activeRoom: null,
  presence: {},
  statuses: {},
  channelsByServer: {},
  conversations: [],
  conversationsLoading: false,
  conversationsLoaded: false
}

const makeStore = () =>
  create<ChatState>()((set, get) => ({ ...IDLE, ...chatListActions(set, get) }) as unknown as ChatState)

let store = makeStore()
const flush = () => new Promise((r) => setTimeout(r, 0))
const conv = (id: string, members: string[], unread = 0) => ({
  id,
  type: 'dm',
  members: members.map((m) => ({ id: m, username: m })),
  unread_count: unread
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useAuthStore.getState().clear()
  useAuthStore.getState().setTokens('A', 'R1')
  useAuthStore.getState().setUser({ id: 'eu' } as User)
  api.fetchPresence.mockResolvedValue({})
  api.fetchActivities.mockResolvedValue({})
  store = makeStore()
})

describe('fetchConversations', () => {
  it('guarda a lista, as não lidas (a sala aberta fica zerada) e busca a presença dos outros', async () => {
    store.setState({ activeRoom: 'conversation:c2' })
    api.listConversations.mockResolvedValue([conv('c1', ['eu', 'ana'], 3), conv('c2', ['eu', 'bia'], 5)])
    await store.getState().fetchConversations()
    const s = store.getState()
    expect(s.conversations.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(s.unreadByRoom).toEqual({ 'conversation:c1': 3, 'conversation:c2': 0 })
    expect(s.conversationsLoaded).toBe(true)
    expect(s.conversationsLoading).toBe(false)
    expect(api.fetchPresence).toHaveBeenCalledWith(['ana', 'bia'])
  })

  it('erro: marca como carregada mesmo assim', async () => {
    api.listConversations.mockRejectedValue(new Error('x'))
    await store.getState().fetchConversations()
    expect(store.getState().conversationsLoaded).toBe(true)
    expect(store.getState().conversationsLoading).toBe(false)
  })

  it('saiu da conta no meio: descarta a resposta e o erro', async () => {
    api.listConversations.mockImplementation(async () => {
      useAuthStore.getState().clear()
      return [conv('c1', ['eu', 'ana'])]
    })
    await store.getState().fetchConversations()
    expect(store.getState().conversations).toEqual([])
    expect(store.getState().conversationsLoaded).toBe(false)

    useAuthStore.getState().setTokens('B', 'R2')
    api.listConversations.mockImplementation(async () => {
      useAuthStore.getState().clear()
      throw new Error('x')
    })
    await store.getState().fetchConversations()
    expect(store.getState().conversationsLoaded).toBe(false)
  })
})

describe('fetchPresenceFor', () => {
  it('sem ids não busca nada', async () => {
    await store.getState().fetchPresenceFor(['', ''])
    expect(api.fetchPresence).not.toHaveBeenCalled()
  })

  it('guarda status e online de cada um (sem repetir id) e aplica as atividades', async () => {
    api.fetchPresence.mockResolvedValue({ ana: 'idle', bia: false, caio: true })
    api.fetchActivities.mockResolvedValue({ ana: { game: 'x' } })
    await store.getState().fetchPresenceFor(['ana', 'bia', 'caio', 'ana'])
    await flush()
    expect(api.fetchPresence).toHaveBeenCalledWith(['ana', 'bia', 'caio'])
    expect(store.getState().statuses).toEqual({ ana: 'idle', bia: 'offline', caio: 'online' })
    expect(store.getState().presence).toEqual({ ana: true, bia: false, caio: true })
    expect(api.applyFetched).toHaveBeenCalledWith(['ana', 'bia', 'caio'], { ana: { game: 'x' } })
  })

  it('atividades falhando (backend antigo) é ignorado; presença falhando só loga', async () => {
    api.fetchPresence.mockResolvedValue({ ana: false })
    api.fetchActivities.mockRejectedValue(new Error('404'))
    await store.getState().fetchPresenceFor(['ana'])
    await flush()
    expect(api.applyFetched).not.toHaveBeenCalled()

    api.fetchPresence.mockRejectedValue(new Error('x'))
    await store.getState().fetchPresenceFor(['bia'])
    expect(store.getState().statuses).toEqual({ ana: 'offline' })
  })

  it('saiu da conta no meio: descarta presença e atividades', async () => {
    api.fetchPresence.mockImplementation(async () => {
      useAuthStore.getState().clear()
      return { ana: true }
    })
    await store.getState().fetchPresenceFor(['ana'])
    expect(store.getState().presence).toEqual({})

    useAuthStore.getState().setTokens('B', 'R2')
    api.fetchPresence.mockResolvedValue({ ana: true })
    api.fetchActivities.mockImplementation(async () => {
      useAuthStore.getState().clear()
      return {}
    })
    await store.getState().fetchPresenceFor(['ana'])
    await flush()
    expect(api.applyFetched).not.toHaveBeenCalled()
  })
})

describe('fetchChannelsForServers', () => {
  it('sem ids não busca nada', async () => {
    await store.getState().fetchChannelsForServers([''])
    expect(api.listChannels).not.toHaveBeenCalled()
  })

  it('guarda os ids dos canais de cada servidor (resposta fora do formato vira lista vazia)', async () => {
    store.setState({ channelsByServer: { s0: ['x'] } })
    api.listChannels.mockImplementation(async (id: string) => (id === 's1' ? [{ id: 'c1' }] : null))
    await store.getState().fetchChannelsForServers(['s1', 's2', 's1'])
    expect(api.listChannels).toHaveBeenCalledTimes(2)
    expect(store.getState().channelsByServer).toEqual({ s0: ['x'], s1: ['c1'], s2: [] })
  })

  it('erro só loga; saiu da conta no meio descarta', async () => {
    api.listChannels.mockRejectedValue(new Error('x'))
    await store.getState().fetchChannelsForServers(['s1'])
    expect(store.getState().channelsByServer).toEqual({})

    api.listChannels.mockImplementation(async () => {
      useAuthStore.getState().clear()
      return [{ id: 'c1' }]
    })
    await store.getState().fetchChannelsForServers(['s1'])
    expect(store.getState().channelsByServer).toEqual({})
  })
})
