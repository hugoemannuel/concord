import { describe, expect, it } from 'vitest'
import { serverAccess, type ServerAccess } from './serverAccess'
import { DEFAULT_EVERYONE, Perm, type ChannelOverwrite, type Role } from './permissions'

const role = (
  id: string,
  position: number,
  permissions: number,
  extra: Partial<Role> = {}
): Role => ({
  id,
  server_id: 's1',
  name: id,
  color: null,
  position,
  permissions,
  hoist: false,
  is_default: false,
  ...extra
})

const DEFAULT_MOD =
  DEFAULT_EVERYONE |
  Perm.MANAGE_CHANNELS |
  Perm.MANAGE_SERVER |
  Perm.MENTION_EVERYONE |
  Perm.MANAGE_MESSAGES |
  Perm.MOVE_MEMBERS |
  Perm.MUTE_MEMBERS |
  Perm.DEAFEN_MEMBERS |
  Perm.KICK_MEMBERS |
  Perm.MANAGE_EXPRESSIONS |
  Perm.DISCONNECT_MEMBERS |
  Perm.MANAGE_NICKNAMES

const roles = [
  role('everyone', 0, DEFAULT_EVERYONE, { is_default: true }),
  role('mod', 2, DEFAULT_MOD),
  role('vip', 1, 0),
  role('gerente', 3, DEFAULT_EVERYONE | Perm.MANAGE_ROLES)
]

const members = [
  { user_id: 'dono' },
  { user_id: 'mod', role_ids: ['mod'] },
  { user_id: 'mod2', role_ids: ['mod'] },
  { user_id: 'vip', role_ids: ['vip'] },
  { user_id: 'ger', role_ids: ['gerente'] },
  { user_id: 'ana' }
]

const privateOverwrites: ChannelOverwrite[] = [
  { target_type: 'role', target_id: 'everyone', allow: 0, deny: Perm.VIEW_CHANNEL },
  { target_type: 'role', target_id: 'vip', allow: Perm.VIEW_CHANNEL, deny: 0 }
]
const channels = [
  { id: 'geral', type: 'text', overwrites: [] },
  { id: 'segredo', type: 'text', overwrites: privateOverwrites },
  { id: 'voz', type: 'voice' },
  {
    id: 'palco',
    type: 'voice',
    overwrites: [
      { target_type: 'role', target_id: 'everyone', allow: 0, deny: Perm.SPEAK }
    ] as ChannelOverwrite[]
  }
]

const as = (meId: string | undefined): ServerAccess =>
  serverAccess({ ownerId: 'dono', meId, members, roles, channels })

describe('serverAccess — permissões no servidor', () => {
  it('o dono pode tudo e é dono', () => {
    const a = as('dono')
    expect(a.isOwner).toBe(true)
    expect(a.can(Perm.BAN_MEMBERS | Perm.MANAGE_ROLES)).toBe(true)
  })

  it('membro comum tem só o padrão do @everyone', () => {
    const a = as('ana')
    expect(a.isOwner).toBe(false)
    expect(a.can(Perm.SEND_MESSAGES)).toBe(true)
    expect(a.can(Perm.MANAGE_CHANNELS)).toBe(false)
    expect(a.highest).toBe(0)
    expect(a.myRoles).toEqual([])
  })

  it('moderador soma o cargo ao @everyone', () => {
    const a = as('mod')
    expect(a.can(Perm.MANAGE_CHANNELS | Perm.KICK_MEMBERS)).toBe(true)
    expect(a.can(Perm.BAN_MEMBERS)).toBe(false)
    expect(a.can(Perm.MANAGE_ROLES)).toBe(false)
    expect(a.highest).toBe(2)
  })

  it('sem login ou fora do servidor não pode nada', () => {
    expect(as(undefined).perms).toBe(0)
    expect(as('zeca').can(Perm.VIEW_CHANNEL)).toBe(false)
  })
})

describe('serverAccess — canais', () => {
  it('canal privado só aparece para quem tem o cargo (e o dono)', () => {
    expect(as('ana').channelPerms('segredo')).toBe(0)
    expect(as('mod').canInChannel('segredo', Perm.VIEW_CHANNEL)).toBe(false)
    expect(as('vip').canInChannel('segredo', Perm.VIEW_CHANNEL)).toBe(true)
    expect(as('dono').canInChannel('segredo', Perm.VIEW_CHANNEL)).toBe(true)
  })

  it('isPrivate vê o deny de VIEW_CHANNEL no @everyone', () => {
    const a = as('dono')
    expect(a.isPrivate('segredo')).toBe(true)
    expect(a.isPrivate('geral')).toBe(false)
    expect(a.isPrivate('nao-existe')).toBe(false)
  })

  it('o deny de SPEAK no palco vale até para moderador', () => {
    expect(as('ana').canInChannel('palco', Perm.SPEAK)).toBe(false)
    expect(as('mod').canInChannel('palco', Perm.SPEAK)).toBe(false)
    expect(as('ana').canInChannel('palco', Perm.CONNECT)).toBe(true)
    expect(as('dono').canInChannel('palco', Perm.SPEAK)).toBe(true)
  })

  it('canal desconhecido não dá permissão', () => {
    expect(as('dono').channelPerms('nada')).toBe(0)
  })

  it('voz sem sobrescritas segue o servidor', () => {
    expect(as('ana').canInChannel('voz', Perm.CONNECT | Perm.SPEAK)).toBe(true)
  })
})

describe('serverAccess — hierarquia', () => {
  it('canActOnMember: acima sim; igual, abaixo, dono e si mesmo não', () => {
    const mod = as('mod')
    expect(mod.canActOnMember('ana')).toBe(true)
    expect(mod.canActOnMember('vip')).toBe(true)
    expect(mod.canActOnMember('mod2')).toBe(false)
    expect(mod.canActOnMember('ger')).toBe(false)
    expect(mod.canActOnMember('dono')).toBe(false)
    expect(mod.canActOnMember('mod')).toBe(false)
    expect(as('dono').canActOnMember('ger')).toBe(true)
    expect(as('ana').canActOnMember('vip')).toBe(false)
  })

  it('canManage: só cargos abaixo do seu mais alto (dono, todos)', () => {
    const ger = as('ger')
    expect(ger.canManage(roles[1])).toBe(true) // mod (2) < gerente (3)
    expect(ger.canManage(roles[3])).toBe(false) // o próprio cargo
    expect(as('dono').canManage(roles[3])).toBe(true)
    expect(as('mod').canManage(roles[2])).toBe(true)
    expect(as('ana').canManage(roles[2])).toBe(false)
  })

  it('canModerateVoiceMember: usa o cargo mais alto (>=) sem imunidade especial do dono', () => {
    const mod = as('mod')
    expect(mod.canModerateVoiceMember('ana')).toBe(true)
    expect(mod.canModerateVoiceMember('vip')).toBe(true)
    expect(mod.canModerateVoiceMember('mod2')).toBe(true)
    expect(mod.canModerateVoiceMember('mod')).toBe(true)
    expect(mod.canModerateVoiceMember('dono')).toBe(true)
    expect(mod.canModerateVoiceMember('ger')).toBe(false)
    expect(as('dono').canModerateVoiceMember('ger')).toBe(true)

    const multi = serverAccess({
      ownerId: 'dono',
      meId: 'mod',
      members: [
        { user_id: 'dono', role_ids: ['gerente'] },
        { user_id: 'mod', role_ids: ['mod'] },
        { user_id: 'multi', role_ids: ['vip', 'gerente'] }
      ],
      roles,
      channels
    })
    expect(multi.canModerateVoiceMember('dono')).toBe(false)
    expect(multi.canModerateVoiceMember('multi')).toBe(false)
  })
})

describe('serverAccess — apelidos', () => {
  it('o próprio: quem tem "Alterar apelido" (todo mundo por padrão) e o dono', () => {
    expect(as('ana').canChangeNickname('ana')).toBe(true)
    expect(as('dono').canChangeNickname('dono')).toBe(true)
    const noChange = [
      role('everyone', 0, DEFAULT_EVERYONE & ~Perm.CHANGE_NICKNAME, { is_default: true }),
      ...roles.slice(1)
    ]
    const ana = serverAccess({ ownerId: 'dono', meId: 'ana', members, roles: noChange, channels })
    expect(ana.canChangeNickname('ana')).toBe(false)
    const dono = serverAccess({ ownerId: 'dono', meId: 'dono', members, roles: noChange, channels })
    expect(dono.canChangeNickname('dono')).toBe(true)
  })

  it('o dos outros: "Gerenciar apelidos" e mesmo cargo ou acima (o dono nunca é alvo)', () => {
    const mod = as('mod')
    expect(mod.canChangeNickname('ana')).toBe(true)
    expect(mod.canChangeNickname('vip')).toBe(true)
    // mesmo cargo: permitido
    expect(mod.canChangeNickname('mod2')).toBe(true)
    // cargo acima: negado
    expect(mod.canChangeNickname('ger')).toBe(false)
    // dono nunca é alvo
    expect(mod.canChangeNickname('dono')).toBe(false)
    expect(as('ana').canChangeNickname('vip')).toBe(false)
    // gerente está acima, mas não tem "Gerenciar apelidos".
    expect(as('ger').canChangeNickname('ana')).toBe(false)
    expect(as('dono').canChangeNickname('ger')).toBe(true)
  })

  it('fora do servidor, nada', () => {
    expect(as('zeca').canChangeNickname('zeca')).toBe(false)
    expect(as(undefined).canChangeNickname('ana')).toBe(false)
  })
})
