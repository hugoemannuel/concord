import { describe, expect, it } from 'vitest'
import {
  railMenuGroups,
  serverMenuContext,
  serverMenuItems,
  settingsSectionsFor,
  type ServerMenuContext
} from './serverMenu'
import { Perm } from './permissions'
import { serverAccess } from './serverAccess'

const member: ServerMenuContext = {
  hasServer: true,
  canInvite: true,
  canChangeOwnNickname: true,
  canOpenSettings: false,
  canManageChannels: false,
  isOwner: false
}
const owner: ServerMenuContext = {
  ...member,
  isOwner: true,
  canOpenSettings: true,
  canManageChannels: true
}

describe('serverMenuItems (menu de dentro)', () => {
  it('membro: convidar, ocultar silenciados, apelido, eventos, notificações e sair', () => {
    expect(serverMenuItems(member)).toEqual([
      'invite',
      'hideMuted',
      'profile',
      'nickname',
      'memberProfile',
      'events',
      'notifications',
      'leave'
    ])
  })

  it('dono: configurações e apagar no lugar de sair', () => {
    expect(serverMenuItems(owner)).toEqual([
      'invite',
      'createChannel',
      'createCategory',
      'hideMuted',
      'profile',
      'nickname',
      'memberProfile',
      'events',
      'notifications',
      'settings',
      'delete'
    ])
  })

  it('sem servidor nem permissões', () => {
    expect(
      serverMenuItems({
        hasServer: false,
        canInvite: false,
        canChangeOwnNickname: false,
        canOpenSettings: false,
        canManageChannels: false,
        isOwner: false
      })
    ).toEqual(['leave'])
  })

  it('os itens só do menu do ícone nunca entram no menu de dentro', () => {
    const inside = serverMenuItems(owner)
    for (const item of ['markRead', 'mute', 'moveTo', 'level']) {
      expect(inside).not.toContain(item)
    }
  })
})

describe('railMenuGroups (menu do ícone)', () => {
  it('membro: grupos na ordem do menu, sem criar canal nem configurações', () => {
    expect(railMenuGroups(member)).toEqual([
      ['markRead'],
      ['invite'],
      ['mute', 'notifications', 'hideMuted'],
      ['level', 'profile', 'nickname', 'memberProfile'],
      ['events'],
      ['moveTo'],
      ['leave']
    ])
  })

  it('quem gerencia canais e configurações vê criar canal, categoria e configurações', () => {
    expect(railMenuGroups(owner)).toEqual([
      ['markRead'],
      ['invite'],
      ['mute', 'notifications', 'hideMuted'],
      ['settings', 'level', 'profile', 'nickname', 'memberProfile'],
      ['createChannel', 'createCategory', 'events'],
      ['moveTo'],
      ['delete']
    ])
  })

  it('sem permissão de convidar ou de apelido, os itens somem', () => {
    const flat = railMenuGroups({ ...member, canInvite: false, canChangeOwnNickname: false }).flat()
    expect(flat).not.toContain('invite')
    expect(flat).not.toContain('nickname')
  })

  it('grupo que ficou vazio some (sem divisória solta)', () => {
    const groups = railMenuGroups({ ...member, canInvite: false })
    expect(groups.every((g) => g.length > 0)).toBe(true)
    expect(groups[1]).toEqual(['mute', 'notifications', 'hideMuted'])
  })
})

describe('settingsSectionsFor', () => {
  it('só as seções que a permissão deixa abrir', () => {
    const ids = settingsSectionsFor(Perm.MANAGE_ROLES, false, false).map((s) => s.id)
    expect(ids).toEqual(['roles', 'members', 'level'])
  })

  it('o dono vê também a configuração de eventos', () => {
    expect(settingsSectionsFor(0, true, false).map((s) => s.id)).toContain('events')
  })
})

describe('serverMenuContext', () => {
  const everyone = {
    id: 'r0', server_id: 's', name: '@everyone', color: null, hoist: false,
    permissions: Perm.CREATE_INVITE | Perm.CHANGE_NICKNAME, position: 0, is_default: true
  }
  const accessOf = (ownerId: string, perms = everyone.permissions) =>
    serverAccess({
      ownerId, meId: 'eu',
      members: [{ user_id: 'eu' }],
      roles: [{ ...everyone, permissions: perms }],
      channels: []
    })

  it('membro comum: convida e muda o apelido, mas não gerencia nada', () => {
    const ctx = serverMenuContext({ access: accessOf('outro'), userId: 'eu', canConfigureEvents: false })
    expect(ctx).toMatchObject({
      hasServer: true, canInvite: true, canChangeOwnNickname: true,
      canOpenSettings: false, canManageChannels: false, isOwner: false
    })
  })

  it('Gerenciar canais libera criar canal e categoria no menu', () => {
    const access = accessOf('outro', everyone.permissions | Perm.MANAGE_CHANNELS)
    const ctx = serverMenuContext({ access, userId: 'eu', canConfigureEvents: false })
    expect(railMenuGroups(ctx).flat()).toEqual(expect.arrayContaining(['createChannel', 'createCategory']))
  })

  it('sem CREATE_INVITE o convite some; "configurar eventos" libera as configurações', () => {
    const access = accessOf('outro', Perm.CHANGE_NICKNAME)
    const ctx = serverMenuContext({ access, userId: 'eu', canConfigureEvents: true })
    const flat = railMenuGroups(ctx).flat()
    expect(flat).not.toContain('invite')
    expect(flat).toContain('settings')
  })

  it('sem o servidor carregado, nada que dependa dele', () => {
    const ctx = serverMenuContext({ access: null, userId: 'eu', canConfigureEvents: false })
    expect(ctx.hasServer).toBe(false)
    expect(railMenuGroups(ctx).flat()).toEqual(['leave'])
  })
})
