import { describe, expect, it } from 'vitest'
import {
  channelMenuItems,
  serverMenuItems,
  type ChannelMenuContext,
  type ServerMenuContext
} from './sidebarMenus'

describe('channelMenuItems', () => {
  const member: ChannelMenuContext = {
    hasServer: true,
    isText: true,
    isSystem: false,
    isPrimary: false,
    index: 1,
    sectionLength: 3,
    canManageChannels: false,
    canManageServer: false,
    canManageRolesHere: false
  }
  const mod: ChannelMenuContext = {
    ...member,
    canManageChannels: true,
    canManageServer: true,
    canManageRolesHere: true
  }

  it('membro só vê as notificações do canal de texto', () => {
    expect(channelMenuItems(member)).toEqual(['notifications'])
    expect(channelMenuItems({ ...member, isText: false })).toEqual([])
    expect(channelMenuItems({ ...member, hasServer: false })).toEqual([])
  })

  it('moderador vê tudo, na ordem do menu', () => {
    expect(channelMenuItems(mod)).toEqual([
      'notifications',
      'move-up',
      'move-down',
      'make-primary',
      'edit',
      'permissions',
      'delete'
    ])
  })

  it('primeiro e último da seção não sobem nem descem', () => {
    expect(channelMenuItems({ ...mod, index: 0 })).not.toContain('move-up')
    expect(channelMenuItems({ ...mod, index: 2 })).not.toContain('move-down')
    expect(channelMenuItems({ ...mod, index: -1 })).not.toContain('move-down')
  })

  it('canal principal, de voz ou de sistema', () => {
    expect(channelMenuItems({ ...mod, isPrimary: true })).not.toContain('make-primary')
    expect(channelMenuItems({ ...mod, isText: false })).not.toContain('make-primary')
    const system = channelMenuItems({ ...mod, isSystem: true })
    expect(system).not.toContain('edit')
    expect(system).not.toContain('permissions')
    expect(system).not.toContain('delete')
  })
})

describe('canal de sala de evento (gerenciado)', () => {
  const mod: ChannelMenuContext = {
    hasServer: true,
    isText: true,
    isSystem: false,
    isPrimary: false,
    index: 1,
    sectionLength: 3,
    canManageChannels: true,
    canManageServer: true,
    canManageRolesHere: true
  }

  it('um canal comum mostra o menu inteiro para quem gerencia', () => {
    expect(channelMenuItems(mod)).toEqual([
      'notifications', 'move-up', 'move-down', 'make-primary', 'edit', 'permissions', 'delete'
    ])
  })

  it('o canal gerenciado só pode ser silenciado e movido: nada de editar, apagar, permissões ou canal principal', () => {
    expect(channelMenuItems({ ...mod, isManaged: true })).toEqual(['notifications', 'move-up', 'move-down'])
  })
})

describe('serverMenuItems', () => {
  const member: ServerMenuContext = {
    hasServer: true,
    canInvite: true,
    canChangeOwnNickname: true,
    canOpenSettings: false,
    isOwner: false
  }

  it('membro: convidar, apelido, eventos, notificações e sair', () => {
    expect(serverMenuItems(member)).toEqual(['invite', 'nickname', 'events', 'notifications', 'leave'])
  })

  it('dono: configurações e apagar no lugar de sair', () => {
    expect(serverMenuItems({ ...member, isOwner: true, canOpenSettings: true })).toEqual([
      'invite',
      'nickname',
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
        isOwner: false
      })
    ).toEqual(['leave'])
  })
})
