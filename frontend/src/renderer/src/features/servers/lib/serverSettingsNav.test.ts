import { describe, expect, it } from 'vitest'
import { ALL_PERMISSIONS, DEFAULT_EVERYONE, Perm } from './permissions'
import {
  canOpenServerSettings,
  resolveServerSection,
  serverSectionLabel,
  visibleServerSections
} from './serverSettingsNav'

const ids = (perms: number): string[] => visibleServerSections(perms).map((s) => s.id)

describe('seções das configurações do servidor', () => {
  it('membro comum não vê nenhuma', () => {
    expect(ids(DEFAULT_EVERYONE)).toEqual([])
    expect(canOpenServerSettings(DEFAULT_EVERYONE)).toBe(false)
  })

  it('o dono e o administrador veem todas', () => {
    expect(ids(ALL_PERMISSIONS)).toEqual(['overview', 'roles', 'members', 'bans', 'audit'])
  })

  it('cada permissão abre só o que usa', () => {
    expect(ids(Perm.MANAGE_SERVER)).toEqual(['overview'])
    expect(ids(Perm.MANAGE_ROLES)).toEqual(['roles', 'members'])
    expect(ids(Perm.KICK_MEMBERS)).toEqual(['members'])
    expect(ids(Perm.BAN_MEMBERS)).toEqual(['members', 'bans'])
    expect(ids(Perm.MANAGE_NICKNAMES)).toEqual(['members'])
    expect(ids(Perm.VIEW_AUDIT_LOG)).toEqual(['audit'])
  })

  it('"Alterar apelido" (o próprio) não abre as configurações', () => {
    expect(ids(Perm.CHANGE_NICKNAME)).toEqual([])
  })

  it('o moderador padrão (editar servidor + expulsar) vê visão geral e membros', () => {
    const mod = DEFAULT_EVERYONE | Perm.MANAGE_SERVER | Perm.MANAGE_CHANNELS | Perm.KICK_MEMBERS
    expect(ids(mod)).toEqual(['overview', 'members'])
    expect(canOpenServerSettings(mod)).toBe(true)
  })

  it('resolveServerSection cai na primeira seção visível', () => {
    expect(resolveServerSection(Perm.KICK_MEMBERS, 'bans')).toBe('members')
    expect(resolveServerSection(Perm.BAN_MEMBERS, 'bans')).toBe('bans')
    expect(resolveServerSection(ALL_PERMISSIONS, 'roles')).toBe('roles')
    expect(resolveServerSection(0, 'overview')).toBeNull()
  })
})

describe('serverSectionLabel', () => {
  it('o nome da seção aberta, ou vazio se não houver', () => {
    const sections = visibleServerSections(Perm.MANAGE_ROLES | Perm.BAN_MEMBERS)
    expect(serverSectionLabel(sections, 'bans')).toBe('Banimentos')
    expect(serverSectionLabel(sections, 'overview')).toBe('')
    expect(serverSectionLabel(sections, null)).toBe('')
  })
})
