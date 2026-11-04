import { describe, expect, it } from 'vitest'
import {
  channelAreaMenuItems,
  channelMenuItems,
  isEmptyChannelArea,
  nextMenuFocus,
  type ChannelMenuContext
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

describe('channelAreaMenuItems', () => {
  it('cada item só com a permissão certa, na ordem do menu', () => {
    expect(channelAreaMenuItems({ canManageChannels: true, canInvite: true })).toEqual(['hideMuted', 'createChannel', 'createCategory', 'invite'])
    expect(channelAreaMenuItems({ canManageChannels: false, canInvite: true })).toEqual(['hideMuted', 'invite'])
    expect(channelAreaMenuItems({ canManageChannels: false, canInvite: false })).toEqual(['hideMuted'])
  })
})

describe('isEmptyChannelArea', () => {
  const target = (inside: boolean): Element => ({ closest: () => (inside ? {} : null) }) as unknown as Element
  it('linha e cabeçalho têm menu próprio', () => {
    expect(isEmptyChannelArea(target(true))).toBe(false)
    expect(isEmptyChannelArea(target(false))).toBe(true)
  })
})

describe('nextMenuFocus', () => {
  it('setas andam e dão a volta; o resto não mexe', () => {
    expect(nextMenuFocus('ArrowDown', -1, 4)).toBe(0)
    expect(nextMenuFocus('ArrowDown', 3, 4)).toBe(0)
    expect(nextMenuFocus('ArrowUp', 0, 4)).toBe(3)
    expect(nextMenuFocus('ArrowUp', 2, 4)).toBe(1)
    expect(nextMenuFocus('Enter', 2, 4)).toBeNull()
  })
})
