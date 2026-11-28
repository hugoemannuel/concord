import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  class MockAudioWorkletNode {}
  ;(globalThis as unknown as { AudioWorkletNode: unknown }).AudioWorkletNode = MockAudioWorkletNode
  ;(globalThis as unknown as { window: unknown }).window = {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
})

const mockRouter = vi.hoisted(() => ({
  navigate: vi.fn(),
  state: { location: { pathname: '/' } }
}))

vi.mock('../../../app/router', () => ({
  default: mockRouter,
  router: mockRouter
}))

const mockState = vi.hoisted(() => ({
  target: { userId: 'u1', name: 'Alvo', x: 100, y: 100, stream: false } as {
    userId: string
    name: string
    x: number
    y: number
    stream?: boolean
    conversationId?: string
  },
  audio: { volume: 0.8, muted: false },
  user: { id: 'me-id' },
  call: {
    status: 'idle',
    participants: [] as Array<{ id: string; username?: string }>,
    serverCalls: {} as Record<
      string,
      {
        call?: { id: string }
        participants: Array<{
          user_id: string
          server_muted?: boolean
          server_deafened?: boolean
        }>
      }
    >
  },
  server: { id: 's1', owner_id: 'dono' },
  member: { user_id: 'u1', username: 'alvo', role_ids: [] as string[] },
  canChangeNick: false,
  isOwner: false,
  canActOnMember: false,
  canModerateVoiceMember: false,
  canInChannel: ((_channelId: string, _want: number) => false) as (
    channelId: string,
    want: number
  ) => boolean,
  channels: [] as Array<{ id: string; name: string; type: string }>,
  roles: [] as unknown[]
}))

vi.mock('../../call/store/userAudioStore', () => ({
  useUserAudioStore: (selector: (s: unknown) => unknown) =>
    selector({
      get: () => mockState.audio,
      setVolume: vi.fn(),
      toggleMuted: vi.fn()
    }),
  streamAudioKey: (id: string) => `stream:${id}`
}))

vi.mock('../store/userMenuStore', () => ({
  useUserMenuStore: (selector: (s: unknown) => unknown) =>
    selector({
      target: mockState.target,
      close: vi.fn()
    })
}))

vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: mockState.user })
}))

vi.mock('../../call/store/callStore', () => ({
  useCallStore: (selector: (s: unknown) => unknown) => selector(mockState.call)
}))

vi.mock('../../friends/store/friendStore', () => ({
  useRelationship: () => 'none',
  useFriendStore: (selector: (s: unknown) => unknown) =>
    selector({
      sendRequest: vi.fn(),
      accept: vi.fn(),
      unblock: vi.fn()
    })
}))

vi.mock('../../servers/store/serverStore', () => ({
  useServerStore: (selector: (s: unknown) => unknown) =>
    selector({
      currentServer: mockState.server,
      currentMembers: [mockState.member],
      roles: mockState.roles,
      channels: mockState.channels,
      addMemberRole: vi.fn(),
      removeMemberRole: vi.fn()
    })
}))

vi.mock('../../servers/hooks/useServerAccess', () => ({
  useServerAccess: () => ({
    isOwner: mockState.isOwner,
    perms: 0,
    highest: 0,
    myRoles: [],
    can: () => mockState.isOwner,
    channelPerms: () => 0,
    canInChannel: (channelId: string, want: number) => mockState.canInChannel(channelId, want),
    highestOf: () => 0,
    canActOnMember: () => mockState.canActOnMember,
    canModerateVoiceMember: () => mockState.canModerateVoiceMember,
    canEditRolesOf: () => true,
    canChangeNickname: () => mockState.canChangeNick ?? false,
    canManage: () => false,
    isPrivate: () => false
  })
}))

import { renderToStaticMarkup } from 'react-dom/server'
import UserContextMenu from './UserContextMenu'

describe('UserContextMenu', () => {
  it('renderiza opções padrão de usuário (Perfil, Mensagem) sem Copiar ID', () => {
    const html = renderToStaticMarkup(<UserContextMenu />)
    expect(html).toContain('Perfil')
    expect(html).toContain('Mensagem')
    expect(html).not.toContain('Copiar ID')
  })

  it('renderiza menu de si mesmo quando o alvo é o próprio usuário', () => {
    mockState.target = { userId: 'me-id', name: 'Eu Mesmo', x: 10, y: 10 }
    const html = renderToStaticMarkup(<UserContextMenu />)
    expect(html).toContain('Perfil')
    expect(html).not.toContain('Copiar ID')
    expect(html).not.toContain('Mensagem')
  })

  it('renderiza menu de stream quando alvo é uma transmissão', () => {
    mockState.target = { userId: 'streamer', name: 'Streamer', x: 10, y: 10, stream: true }
    const html = renderToStaticMarkup(<UserContextMenu />)
    expect(html).toContain('Transmissão de Streamer')
  })

  it('renderiza menu do Maestro quando o alvo é o Maestro', () => {
    mockState.target = { userId: 'maestro-bot', name: 'Maestro', x: 10, y: 10 }
    const html = renderToStaticMarkup(<UserContextMenu />)
    expect(html).toContain('Maestro')
  })

  it('renderiza opção de alterar apelido quando permitido no servidor', () => {
    mockState.target = { userId: 'u1', name: 'Alvo', x: 10, y: 10 }
    mockState.canChangeNick = true
    mockRouter.state.location.pathname = '/servers/s1/ch1'
    const html = renderToStaticMarkup(<UserContextMenu />)
    expect(html).toContain('Alterar apelido')
  })

  it('renderiza Fechar DM quando há conversationId no alvo', () => {
    mockState.target = { userId: 'u1', name: 'Alvo', x: 10, y: 10, conversationId: 'c123' }
    mockState.canChangeNick = false
    const html = renderToStaticMarkup(<UserContextMenu />)
    expect(html).toContain('Fechar DM')
  })

  it('renderiza controles de volume quando em chamada com o usuário', () => {
    mockState.target = { userId: 'u1', name: 'Alvo', x: 10, y: 10 }
    mockState.call = {
      status: 'active',
      participants: [{ id: 'u1', username: 'alvo' }],
      serverCalls: {}
    }
    const html = renderToStaticMarkup(<UserContextMenu />)
    expect(html).toContain('Volume do usuário')
  })

  it('renderiza alterar apelido no menu de si mesmo quando na tela do servidor', () => {
    mockState.target = { userId: 'me-id', name: 'Eu Mesmo', x: 10, y: 10 }
    mockState.member = { user_id: 'me-id', username: 'eu', role_ids: [] }
    mockState.canChangeNick = true
    mockRouter.state.location.pathname = '/servers/s1/ch1'
    const html = renderToStaticMarkup(<UserContextMenu />)
    expect(html).toContain('Alterar apelido')
    expect(html).toContain('Perfil')
  })

  // Regressão da issue #331: o dono não tinha como dar cargos a si mesmo.
  it('o dono vê "Cargos" no menu de si mesmo', () => {
    mockState.target = { userId: 'me-id', name: 'Eu Mesmo', x: 10, y: 10 }
    mockState.member = { user_id: 'me-id', username: 'eu', role_ids: [] }
    mockState.isOwner = true
    mockState.roles = [
      { id: 'vip', name: 'VIP', color: null, position: 1, permissions: 0, is_default: false }
    ]
    const html = renderToStaticMarkup(<UserContextMenu />)
    expect(html).toContain('Cargos')
  })

  it('quem não é dono não vê "Cargos" no menu de si mesmo', () => {
    mockState.target = { userId: 'me-id', name: 'Eu Mesmo', x: 10, y: 10 }
    mockState.isOwner = false
    const html = renderToStaticMarkup(<UserContextMenu />)
    expect(html).not.toContain('Cargos')
    mockState.roles = []
  })

  it('moderador vê ações de voz no dono sem cargo acima/mesmo cargo em call sem exibir expulsar, banir nem castigo', () => {
    mockState.target = { userId: 'dono', name: 'Dono', x: 10, y: 10 }
    mockState.member = { user_id: 'dono', username: 'dono', role_ids: [] }
    mockState.isOwner = false
    mockState.canActOnMember = false
    mockState.canModerateVoiceMember = true
    mockState.canInChannel = () => true
    mockState.channels = [
      { id: 'v1', name: 'Geral', type: 'voice' },
      { id: 'v2', name: 'Jogos', type: 'voice' }
    ]
    mockState.call = {
      status: 'active',
      participants: [{ id: 'dono', username: 'dono' }],
      serverCalls: {
        v1: { call: { id: 'call-1' }, participants: [{ user_id: 'dono' }] }
      }
    }
    const html = renderToStaticMarkup(<UserContextMenu />)
    expect(html).toContain('Silenciar no servidor')
    expect(html).toContain('Ensurdecer no servidor')
    expect(html).toContain('Desconectar da chamada')
    expect(html).toContain('Mover para')
    expect(html).not.toContain('Expulsar')
    expect(html).not.toContain('Banir')
    expect(html).not.toContain('Castigo')
    mockState.canModerateVoiceMember = false
    mockState.canInChannel = () => false
    mockState.channels = []
    mockState.call = { status: 'idle', participants: [], serverCalls: {} }
  })

  it('moderador não vê ações de voz nem castigo contra cargo acima', () => {
    mockState.target = { userId: 'chefe', name: 'Chefe', x: 10, y: 10 }
    mockState.member = { user_id: 'chefe', username: 'chefe', role_ids: [] }
    mockState.isOwner = false
    mockState.canActOnMember = false
    mockState.canModerateVoiceMember = false
    mockState.canInChannel = () => true
    mockState.channels = [
      { id: 'v1', name: 'Geral', type: 'voice' },
      { id: 'v2', name: 'Jogos', type: 'voice' }
    ]
    mockState.call = {
      status: 'active',
      participants: [{ id: 'chefe', username: 'chefe' }],
      serverCalls: {
        v1: { call: { id: 'call-1' }, participants: [{ user_id: 'chefe' }] }
      }
    }
    const html = renderToStaticMarkup(<UserContextMenu />)
    expect(html).not.toContain('Silenciar no servidor')
    expect(html).not.toContain('Ensurdecer no servidor')
    expect(html).not.toContain('Desconectar da chamada')
    expect(html).not.toContain('Mover para')
    expect(html).not.toContain('Castigo')
    mockState.canInChannel = () => false
    mockState.channels = []
    mockState.call = { status: 'idle', participants: [], serverCalls: {} }
  })

  it('moderador vê ações de voz para visitante em call (fora de currentMembers)', () => {
    mockState.target = { userId: 'guest-1', name: 'Visitante', x: 10, y: 10 }
    mockState.member = { user_id: 'u1', username: 'alvo', role_ids: [] }
    mockState.isOwner = false
    mockState.canActOnMember = false
    mockState.canModerateVoiceMember = true
    mockState.canInChannel = () => true
    mockState.channels = [
      { id: 'v1', name: 'Geral', type: 'voice' },
      { id: 'v2', name: 'Jogos', type: 'voice' }
    ]
    mockState.call = {
      status: 'active',
      participants: [{ id: 'guest-1', username: 'visitante' }],
      serverCalls: {
        v1: { call: { id: 'call-1' }, participants: [{ user_id: 'guest-1' }] }
      }
    }
    const html = renderToStaticMarkup(<UserContextMenu />)
    expect(html).toContain('Silenciar no servidor')
    expect(html).toContain('Ensurdecer no servidor')
    expect(html).toContain('Desconectar da chamada')
    expect(html).toContain('Mover para')
    mockState.canModerateVoiceMember = false
    mockState.canInChannel = () => false
    mockState.channels = []
    mockState.call = { status: 'idle', participants: [], serverCalls: {} }
  })

  it('menu próprio exibe liberar fala/áudio quando silenciado/ensurdecido pelo servidor e com permissão no canal, sem desconectar', () => {
    mockState.target = { userId: 'me-id', name: 'Eu Mesmo', x: 10, y: 10 }
    mockState.member = { user_id: 'me-id', username: 'eu', role_ids: [] }
    mockState.canInChannel = () => true
    mockState.call = {
      status: 'active',
      participants: [{ id: 'me-id', username: 'eu' }],
      serverCalls: {
        v1: {
          call: { id: 'call-1' },
          participants: [{ user_id: 'me-id', server_muted: true, server_deafened: true }]
        }
      }
    }
    const html = renderToStaticMarkup(<UserContextMenu />)
    expect(html).toContain('Liberar a fala no servidor')
    expect(html).toContain('Liberar o áudio no servidor')
    expect(html).not.toContain('Desconectar da chamada')
    mockState.canInChannel = () => false
    mockState.call = { status: 'idle', participants: [], serverCalls: {} }
  })

  it('menu próprio não exibe seção de voz sem permissão no canal', () => {
    mockState.target = { userId: 'me-id', name: 'Eu Mesmo', x: 10, y: 10 }
    mockState.canInChannel = () => false
    mockState.call = {
      status: 'active',
      participants: [{ id: 'me-id', username: 'eu' }],
      serverCalls: {
        v1: { call: { id: 'call-1' }, participants: [{ user_id: 'me-id', server_muted: true }] }
      }
    }
    const html = renderToStaticMarkup(<UserContextMenu />)
    expect(html).not.toContain('Silenciar no servidor')
    expect(html).not.toContain('Liberar a fala no servidor')
    mockState.call = { status: 'idle', participants: [], serverCalls: {} }
  })
})
