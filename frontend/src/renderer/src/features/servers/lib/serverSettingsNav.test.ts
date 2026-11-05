import { describe, expect, it } from 'vitest'
import { ALL_PERMISSIONS, DEFAULT_EVERYONE, Perm } from './permissions'
import {
  canOpenServerSettings,
  resolveServerSection,
  serverSectionLabel,
  visibleServerSections
} from './serverSettingsNav'

const ids = (perms: number): string[] => visibleServerSections(perms).map((s) => s.id)
const ownerIds = (perms: number): string[] => visibleServerSections(perms, true).map((s) => s.id)

describe('seções das configurações do servidor', () => {
  it('membro comum vê só a aba Plugins (é de todos)', () => {
    expect(ids(DEFAULT_EVERYONE)).toEqual(['plugins'])
    expect(canOpenServerSettings(DEFAULT_EVERYONE)).toBe(true)
    expect(ids(0)).toContain('plugins')
    expect(canOpenServerSettings(0)).toBe(true)
  })

  it('com Gerenciar servidor, Plugins vem antes de Nível', () => {
    expect(ids(Perm.MANAGE_SERVER).slice(-2)).toEqual(['plugins', 'level'])
  })

  it('o dono e o administrador veem todas', () => {
    expect(ids(ALL_PERMISSIONS)).toEqual(['overview', 'tag', 'look', 'roles', 'members', 'bans', 'audit', 'plugins', 'level'])
  })

  it('cada permissão abre só o que usa', () => {
    expect(ids(Perm.MANAGE_SERVER)).toEqual(['overview', 'tag', 'look', 'plugins', 'level'])
    expect(ids(Perm.MANAGE_ROLES)).toEqual(['roles', 'members', 'plugins', 'level'])
    expect(ids(Perm.KICK_MEMBERS)).toEqual(['members', 'plugins', 'level'])
    expect(ids(Perm.BAN_MEMBERS)).toEqual(['members', 'bans', 'plugins', 'level'])
    expect(ids(Perm.MANAGE_NICKNAMES)).toEqual(['members', 'plugins', 'level'])
    // O registro de auditoria só para quem tem a permissão (ou o dono/administrador).
    expect(ids(Perm.VIEW_AUDIT_LOG)).toEqual(['audit', 'plugins'])
  })

  it('só "Alterar apelido" (o próprio): nenhuma seção de gestão, só a aba Plugins', () => {
    expect(ids(Perm.CHANGE_NICKNAME)).toEqual(['plugins'])
  })

  it('o moderador padrão (editar servidor + expulsar) vê o perfil e membros', () => {
    const mod = DEFAULT_EVERYONE | Perm.MANAGE_SERVER | Perm.MANAGE_CHANNELS | Perm.KICK_MEMBERS
    expect(ids(mod)).toEqual(['overview', 'tag', 'look', 'members', 'plugins', 'level'])
    expect(canOpenServerSettings(mod)).toBe(true)
  })

  it('resolveServerSection cai na primeira seção visível', () => {
    expect(resolveServerSection(Perm.KICK_MEMBERS, 'bans')).toBe('members')
    expect(resolveServerSection(Perm.BAN_MEMBERS, 'bans')).toBe('bans')
    expect(resolveServerSection(ALL_PERMISSIONS, 'roles')).toBe('roles')
    expect(resolveServerSection(0, 'overview')).toBe('plugins')
  })
})

describe('serverSectionLabel', () => {
  it('o nome da seção aberta, ou vazio se não houver', () => {
    const sections = visibleServerSections(Perm.MANAGE_ROLES | Perm.BAN_MEMBERS)
    expect(serverSectionLabel(sections, 'bans')).toBe('Banimentos')
    expect(serverSectionLabel(sections, 'overview')).toBe('')
    expect(serverSectionLabel(sections, null)).toBe('')
  })

  it('Eventos aparece para quem recebeu a configuração dos eventos, mesmo sem nenhuma permissão', () => {
    expect(visibleServerSections(0, false, true).map((s) => s.id)).toEqual(['events', 'plugins'])
    expect(canOpenServerSettings(0, false, true)).toBe(true)
    expect(canOpenServerSettings(0, false, false)).toBe(true)
    expect(resolveServerSection(0, 'overview', false, true)).toBe('events')
  })

  it('Eventos é do dono e de quem recebeu a configuração: o administrador não vê, e entra antes de Nível', () => {
    expect(ids(ALL_PERMISSIONS)).not.toContain('events')
    expect(ownerIds(ALL_PERMISSIONS)).toEqual(['overview', 'tag', 'look', 'roles', 'members', 'bans', 'audit', 'events', 'plugins', 'level'])
  })

  it('pedir Eventos sem ser o dono cai na primeira seção visível', () => {
    expect(resolveServerSection(ALL_PERMISSIONS, 'events')).toBe('overview')
    expect(resolveServerSection(ALL_PERMISSIONS, 'events', true)).toBe('events')
  })

  it('o título da seção vem do rótulo', () => {
    expect(serverSectionLabel(visibleServerSections(ALL_PERMISSIONS, true), 'events')).toBe('Eventos')
  })
})
