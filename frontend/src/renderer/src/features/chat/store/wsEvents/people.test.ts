import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicProfile } from '../../../profile/api/users'
import type { ChatState } from '../chatStore'
import type { ChatWsContext } from './context'

const env = vi.hoisted(() => ({
  profiles: { apply: vi.fn() },
  auth: {
    user: { id: 'me', username: 'eu', display_name: 'Eu', status: 'invisible' },
    setUser: vi.fn()
  },
  servers: {
    currentServer: { id: 's1' } as { id: string } | null,
    currentMembers: [{ user_id: 'ana', display_name: 'Ana', role: 'member' }],
    updateMember: vi.fn()
  },
  friends: { friends: [{ id: 'ana', display_name: 'Ana' }], loadAll: vi.fn() },
  setFriends: vi.fn(),
  toast: { info: vi.fn(), success: vi.fn() },
  ping: vi.fn()
}))
vi.mock('../../../profile/store/profileStore', () => ({
  useProfileStore: { getState: () => env.profiles }
}))
vi.mock('../../../auth/store/authStore', () => ({ useAuthStore: { getState: () => env.auth } }))
vi.mock('../../../servers/store/serverStore', () => ({
  useServerStore: { getState: () => env.servers }
}))
vi.mock('../../../friends/store/friendStore', () => ({
  useFriendStore: { getState: () => env.friends, setState: env.setFriends }
}))
vi.mock('../../../../shared/store/toastStore', () => ({ showToast: env.toast }))
vi.mock('./alerts', () => ({ ping: env.ping }))

const { PEOPLE_HANDLERS, applyUserUpdate, lookOf } = await import('./people')

const profile = (extra: Partial<PublicProfile> = {}): PublicProfile =>
  ({ id: 'ana', username: 'ana', display_name: 'Ana Nova', ...extra }) as PublicProfile

function fakeCtx(): { ctx: ChatWsContext; state: () => ChatState } {
  let state = { presence: {}, statuses: {} } as unknown as ChatState
  const ctx = {
    set: (next) => {
      state = { ...state, ...next(state) }
    },
    get: () => state
  } as ChatWsContext
  return { ctx, state: () => state }
}

const send = (type: string, payload: Record<string, unknown>, ctx = fakeCtx().ctx): void =>
  PEOPLE_HANDLERS[type](payload, ctx, { type, payload })

beforeEach(() => {
  vi.clearAllMocks()
  env.servers.currentServer = { id: 's1' }
})

describe('lookOf', () => {
  it('foto ausente vira null e o estilo do nome só vai se existir', () => {
    expect(lookOf(profile())).toEqual({ display_name: 'Ana Nova', avatar_url: null })
    const style = { color: 'red' } as unknown as PublicProfile['name_style']
    expect(lookOf(profile({ avatar_url: 'a.png', name_style: style }))).toEqual({
      display_name: 'Ana Nova',
      avatar_url: 'a.png',
      name_style: style
    })
  })
})

describe('applyUserUpdate', () => {
  it('de outra pessoa: cache, membro do servidor aberto e amigo', () => {
    applyUserUpdate(profile())
    expect(env.profiles.apply).toHaveBeenCalled()
    expect(env.auth.setUser).not.toHaveBeenCalled()
    expect(env.servers.updateMember).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ user_id: 'ana', display_name: 'Ana Nova', role: 'member' })
    )
    expect(env.setFriends).toHaveBeenCalledWith({
      friends: [{ id: 'ana', display_name: 'Ana Nova', avatar_url: null }]
    })
  })

  it('o meu: atualiza a sessão mantendo o status escolhido', () => {
    applyUserUpdate(profile({ id: 'me', status: 'online' } as Partial<PublicProfile>))
    expect(env.auth.setUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'me', display_name: 'Ana Nova', status: 'invisible' })
    )
    expect(env.servers.updateMember).not.toHaveBeenCalled()
    expect(env.setFriends).not.toHaveBeenCalled()
  })

  it('o meu: faixa e moldura removidas em outro aparelho somem da sessão', () => {
    env.auth.user = {
      ...env.auth.user,
      nameplate_url: '/n',
      avatar_decoration_url: '/d'
    } as typeof env.auth.user
    applyUserUpdate(profile({ id: 'me' }))
    expect(env.auth.setUser).toHaveBeenLastCalledWith(
      expect.objectContaining({ nameplate_url: null, avatar_decoration_url: null })
    )
  })

  it('sem servidor aberto: não mexe em membros', () => {
    env.servers.currentServer = null
    applyUserUpdate(profile())
    expect(env.servers.updateMember).not.toHaveBeenCalled()
  })

  it('user:update sem id é ignorado', () => {
    send('user:update', { user: {} })
    send('user:update', { user: profile() })
    expect(env.profiles.apply).toHaveBeenCalledOnce()
  })
})

describe('presença e amizades', () => {
  it('presence:update grava status e online', () => {
    const { ctx, state } = fakeCtx()
    send('presence:update', { user_id: 'ana', status: 'dnd', online: true }, ctx)
    send('presence:update', { user_id: 'bia', online: false }, ctx)
    expect(state().statuses).toEqual({ ana: 'dnd', bia: 'offline' })
    expect(state().presence).toEqual({ ana: true, bia: false })
  })

  it('friend:request relê, avisa e mostra o toast', () => {
    send('friend:request', { user: { id: 'ana', username: 'ana', display_name: 'Ana' } })
    expect(env.friends.loadAll).toHaveBeenCalled()
    expect(env.ping).toHaveBeenCalledWith(expect.objectContaining({ kind: 'friend_request' }))
    expect(env.toast.info).toHaveBeenCalledWith('Ana (@ana) te enviou um pedido de amizade')
  })

  it('friend:request:accepted mostra o toast; sem usuário só relê', () => {
    send('friend:request:accepted', { user: { id: 'ana', username: 'ana', display_name: 'Ana' } })
    send('friend:request:accepted', {})
    send('friend:request', {})
    expect(env.toast.success).toHaveBeenCalledOnce()
    expect(env.ping).not.toHaveBeenCalled()
    expect(env.friends.loadAll).toHaveBeenCalledTimes(3)
  })

  it.each([
    'friend:request:declined',
    'friend:request:cancelled',
    'friend:removed',
    'relationship:blocked',
    'relationship:unblocked'
  ])('%s só relê as listas', (type) => {
    send(type, {})
    expect(env.friends.loadAll).toHaveBeenCalledOnce()
    expect(env.toast.info).not.toHaveBeenCalled()
  })
})
