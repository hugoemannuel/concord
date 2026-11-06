import { describe, expect, it } from 'vitest'
import type { User } from '../../auth/store/authStore'
import type { Channel } from '../../servers/api/channels'
import type { Server, ServerMember } from '../../servers/api/servers'
import type { Role } from '../../servers/lib/permissions'
import type { PublicProfile } from '../api/users'
import { hasCardInfo, OWNER_STYLE, profileCardView, type CardViewInput } from './profileCardView'

const target = {
  userId: 'u1',
  name: 'Alvo',
  anchor: { top: 0, left: 0, right: 0, bottom: 0 },
  side: 'left' as const
}
const server = { id: 's1', owner_id: 'dono' } as Server
const member = (over: Partial<ServerMember> = {}): ServerMember => ({
  server_id: 's1',
  user_id: 'u1',
  role: 'member',
  role_ids: ['r1'],
  joined_at: '2026-01-10T00:00:00Z',
  username: 'membro',
  display_name: 'Membro',
  ...over
})
const roles = [
  { id: 'r1', name: 'Mod', position: 1, color: 0xff0000, is_default: false }
] as unknown as Role[]
const profile = (over: Partial<PublicProfile> = {}): PublicProfile => ({
  id: 'u1',
  username: 'ana',
  display_name: 'Ana',
  pronouns: 'ela',
  bio: 'oi',
  status_text: '',
  links: [{ url: 'https://x.com/ana' }],
  status: 'idle',
  created_at: '2025-05-01T00:00:00Z',
  ...over
})

const input = (over: Partial<CardViewInput> = {}): CardViewInput => ({
  target,
  me: { id: 'me', display_name: 'Eu', username: 'eu', status: 'dnd' } as User,
  server: null,
  roles: [],
  channels: [],
  serverCalls: {},
  pathname: '/',
  canChangeNickname: false,
  online: false,
  mutual: null,
  profileSettled: null,
  mutualSettled: null,
  ...over
})

describe('profileCardView', () => {
  it('perfil de outra pessoa fora de servidor', () => {
    const v = profileCardView(input({ profile: profile() }))
    expect(v.isMe).toBe(false)
    expect(v.card).toMatchObject({
      display_name: 'Ana',
      username: 'ana',
      links: ['https://x.com/ana']
    })
    expect(v.shownName).toBe('Ana')
    expect(v.status).toBe('idle')
    expect(v.inServer).toBe(false)
    expect(v.memberRoles).toEqual([])
    expect(v.role.avatar).toBe('bg-indigo-600')
    expect(v.profileLoading).toBe(false)
    expect(v.info.mutualLoading).toBe(true)
    expect(v.info.salinhaSince).not.toBeNull()
  })

  it('o próprio cartão usa a sessão e o status escolhido', () => {
    const v = profileCardView(input({ target: { ...target, userId: 'me' } }))
    expect(v.isMe).toBe(true)
    expect(v.card.display_name).toBe('Eu')
    expect(v.status).toBe('dnd')
    expect(v.profileLoading).toBe(false)
    expect(v.info.mutualLoading).toBe(false)
  })

  it('sem status na sessão, o próprio aparece online', () => {
    const v = profileCardView(
      input({ target: { ...target, userId: 'me' }, me: { id: 'me' } as User })
    )
    expect(v.status).toBe('online')
  })

  it('bot segue o status do servidor, como qualquer pessoa (o backend o manda online)', () => {
    const online = profileCardView(input({ profile: profile({ is_bot: true, status: 'online' }) }))
    expect(online.isBot).toBe(true)
    expect(online.status).toBe('online')
    const known = profileCardView(
      input({ profile: profile({ is_bot: true, status: 'online' }), knownStatus: 'offline' })
    )
    expect(known.status).toBe('offline')
  })

  it('status: o do websocket, depois o do perfil, depois a presença', () => {
    expect(profileCardView(input({ profile: profile(), knownStatus: 'dnd' })).status).toBe('dnd')
    expect(profileCardView(input({ online: true })).status).toBe('online')
    expect(profileCardView(input()).status).toBe('offline')
  })

  it('perfil ainda carregando: usa o membro e o nome do alvo', () => {
    const v = profileCardView(input({ member: member({ display_name: undefined }), server }))
    expect(v.profileLoading).toBe(true)
    expect(v.card.display_name).toBe('Alvo')
    expect(v.card.username).toBe('membro')
    expect(v.card.links).toEqual([])
    const settled = profileCardView(input({ profileSettled: 'u1' }))
    expect(settled.profileLoading).toBe(false)
  })

  it('no servidor aberto: apelido, cargos, cor do cargo e desde quando', () => {
    const v = profileCardView(
      input({
        server,
        member: member({ nickname: 'Apelido' }),
        roles,
        pathname: '/servers/s1/c1',
        canChangeNickname: true
      })
    )
    expect(v.inServer).toBe(true)
    expect(v.nickname).toBe('Apelido')
    expect(v.shownName).toBe('Apelido')
    expect(v.canNickname).toBe(true)
    expect(v.memberRoles.map((r) => r.id)).toEqual(['r1'])
    expect(v.role.color).toBe('#ff0000')
    expect(v.info.serverSince).not.toBeNull()
    expect(v.info.hasInfo).toBe(true)
  })

  it('fora da tela do servidor o apelido não vale', () => {
    const v = profileCardView(
      input({ server, member: member({ nickname: 'Apelido' }), pathname: '/dm/u1' })
    )
    expect(v.nickname).toBeNull()
    expect(v.canNickname).toBe(false)
  })

  it('membro sem apelido nem cargo colorido', () => {
    const v = profileCardView(
      input({ server, member: member({ role_ids: [] }), pathname: '/servers/s1' })
    )
    expect(v.nickname).toBeNull()
    expect(v.role.color).toBe('#6366f1')
  })

  it('dono do servidor: cor e avatar do dono', () => {
    const v = profileCardView(
      input({ server: { ...server, owner_id: 'u1' }, member: member(), level: 12 })
    )
    expect(v.isServerOwner).toBe(true)
    expect(v.role).toEqual({ color: OWNER_STYLE.color, avatar: OWNER_STYLE.avatar })
    expect(v.info.tier).not.toBeNull()
    expect(v.fallbackBanner).toContain(v.info.tier!.color)
  })

  it('em call: acha o canal de voz', () => {
    const channels = [{ id: 'c9', name: 'Geral' }] as Channel[]
    const serverCalls = { c9: { participants: [{ user_id: 'u1' }] } }
    const v = profileCardView(input({ channels, serverCalls }))
    expect(v.info.voiceChannel?.name).toBe('Geral')
  })

  it('amigos e servidores em comum', () => {
    const mutual = {
      mutual_friends: [{ id: 'f1', username: 'f', display_name: 'F' }],
      mutual_servers: [{ id: 's1', name: 'S' }]
    } as CardViewInput['mutual']
    const v = profileCardView(input({ mutual }))
    expect(v.info.mutualFriends).toHaveLength(1)
    expect(v.info.mutualServers).toHaveLength(1)
    expect(v.info.mutualLoading).toBe(false)
  })
})

describe('profileCardView: vínculo', () => {
  it('sem vínculo (perfil): sem o @ e marcado como none', () => {
    const v = profileCardView(
      input({ profile: profile({ relationship: 'none', username: 'ana' }) })
    )
    expect(v.card.username).toBeUndefined()
    expect(v.link).toBe('none')
    expect(v.stranger).toBe(true)
  })

  it('antes do perfil chegar, vale o vínculo de onde o cartão abriu (ranking)', () => {
    const v = profileCardView(
      input({ target: { ...target, username: 'ana', relationship: 'none' } })
    )
    expect(v.stranger).toBe(true)
    expect(v.card.username).toBeUndefined()
  })

  it('com vínculo mostra o @', () => {
    const v = profileCardView(input({ profile: profile({ relationship: 'shared_server' }) }))
    expect(v.stranger).toBe(false)
    expect(v.card.username).toBe('ana')
  })
})

describe('hasCardInfo', () => {
  const empty = {
    tier: null,
    salinhaSince: null,
    serverSince: null,
    mutualFriends: [],
    mutualServers: [],
    mutualLoading: false
  }
  it('nada para mostrar: sem caixa de informações', () => {
    expect(hasCardInfo(empty, false)).toBe(false)
  })
  it('qualquer seção liga a caixa', () => {
    expect(hasCardInfo(empty, true)).toBe(true)
    expect(hasCardInfo({ ...empty, mutualLoading: true }, false)).toBe(true)
    expect(hasCardInfo({ ...empty, mutualServers: [{ id: 's', name: 'S' }] }, false)).toBe(true)
  })
})

describe('perfil do servidor no cartão', () => {
  const profile = {
    id: 'u2',
    username: 'bia',
    display_name: 'Bia',
    bio: 'global',
    pronouns: 'ela',
    links: [{ url: 'https://a.co' }],
    status: 'online',
    avatar_url: '/global',
    created_at: '2026-01-01T00:00:00Z'
  } as never
  const server = { id: 's1', owner_id: 'dono' } as never
  const member = { user_id: 'u2', nickname: 'Bibi', role_ids: [] } as never
  const base = {
    target: { userId: 'u2', name: 'Bia' },
    me: { id: 'u1' },
    profile,
    member,
    server,
    roles: [],
    channels: [],
    serverCalls: {},
    pathname: '/servers/s1/channels/c1',
    canChangeNickname: false,
    online: true,
    mutual: null,
    profileSettled: null,
    mutualSettled: null
  } as never as CardViewInput

  it('sem perfil do servidor, o global de sempre', () => {
    const view = profileCardView(base)
    expect(view.card.bio).toBe('global')
    expect(view.card.avatar_url).toBe('/global')
    expect(view.card.nickname).toBe('Bibi')
  })

  it('sobrescreve só o que tem, inclusive texto vazio', () => {
    const view = profileCardView({
      ...base,
      memberProfile: { bio: '', links: [{ url: 'https://b.co' }], avatar_url: '/s1' }
    })
    expect(view.card.bio).toBe('')
    expect(view.card.links).toEqual(['https://b.co'])
    expect(view.card.avatar_url).toBe('/s1')
    expect(view.card.pronouns).toBe('ela')
  })

  it('ver o global tira o apelido e o perfil do servidor', () => {
    const view = profileCardView({ ...base, memberProfile: { bio: 'daqui' }, globalView: true })
    expect(view.card.bio).toBe('global')
    expect(view.card.nickname).toBeNull()
    expect(view.shownName).toBe('Bia')
  })
})
