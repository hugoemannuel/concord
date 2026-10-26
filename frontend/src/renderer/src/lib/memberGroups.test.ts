import { describe, expect, it } from 'vitest'
import { groupMembers, memberColor, serverMemberColorCss, type MemberGroup } from './memberGroups'
import type { Role } from './permissions'

const role = (id: string, position: number, extra: Partial<Role> = {}): Role => ({
  id,
  server_id: 's1',
  name: id.toUpperCase(),
  color: null,
  position,
  permissions: 0,
  hoist: false,
  is_default: false,
  ...extra
})

const everyone = role('everyone', 0, { name: '@everyone', is_default: true })
const bots = role('bots', 1, { name: 'Bots', hoist: true, is_system: true })
const roles: Role[] = [
  everyone,
  bots,
  role('mod', 4, { hoist: true, color: 0x00ff00 }),
  role('vip', 3, { hoist: true, color: 0xff00ff }),
  role('artista', 2, { color: 0x0000ff }), // colorido, mas não exibido separadamente
  role('sem-cor', 5)
]

const member = (id: string, ...roleIds: string[]): { user_id: string; role_ids: string[] } => ({
  user_id: id,
  role_ids: roleIds
})
const members = [
  member('dono'),
  member('mod', 'mod'),
  member('vip', 'vip'),
  member('vipmod', 'vip', 'mod'),
  member('maestro', 'bots'),
  member('artista', 'artista'),
  member('ana'),
  member('off', 'mod')
]
const online = new Set(['dono', 'mod', 'vip', 'vipmod', 'maestro', 'artista', 'ana'])

const group = (): MemberGroup<ReturnType<typeof member>>[] =>
  groupMembers({ members, roles, ownerId: 'dono', isOnline: (id) => online.has(id) })

describe('groupMembers', () => {
  it('põe o dono em cima, depois os cargos exibidos, Bots abaixo de todos os cargos, os membros sem cargo e os offline', () => {
    expect(group().map((g) => g.key)).toEqual([
      'owner',
      'role:mod',
      'role:vip',
      'role:bots',
      'members',
      'offline'
    ])
  })

  it('cada pessoa fica só no grupo do seu cargo exibido mais alto e o bot fica em Bots', () => {
    const byKey = Object.fromEntries(group().map((g) => [g.key, g.members.map((m) => m.user_id)]))
    expect(byKey['role:mod']).toEqual(['mod', 'vipmod'])
    expect(byKey['role:vip']).toEqual(['vip'])
    expect(byKey['role:bots']).toEqual(['maestro'])
  })

  it('cargo colorido mas não exibido separadamente não cria grupo', () => {
    const byKey = Object.fromEntries(group().map((g) => [g.key, g.members.map((m) => m.user_id)]))
    expect(byKey['members']).toEqual(['artista', 'ana'])
  })

  it('offline vai todo para o fim, mesmo com cargo exibido', () => {
    const offline = group().find((g) => g.key === 'offline')
    expect(offline?.members.map((m) => m.user_id)).toEqual(['off'])
  })

  it('usa o nome do cargo no título e guarda o id', () => {
    const mod = group().find((g) => g.key === 'role:mod')
    expect(mod?.title).toBe('MOD')
    expect(mod?.roleId).toBe('mod')
    const botGroup = group().find((g) => g.key === 'role:bots')
    expect(botGroup?.title).toBe('Bots')
    expect(botGroup?.roleId).toBe('bots')
  })

  it('não cria grupo vazio e o dono offline cai em Offline', () => {
    const groups = groupMembers({
      members: [member('dono'), member('ana')],
      roles,
      ownerId: 'dono',
      isOnline: (id) => id === 'ana'
    })
    expect(groups.map((g) => g.key)).toEqual(['members', 'offline'])
    expect(groups[1].members[0].user_id).toBe('dono')
  })

  it('o @everyone nunca vira grupo, mesmo marcado como exibido', () => {
    const groups = groupMembers({
      members: [member('ana', 'everyone')],
      roles: [{ ...everyone, hoist: true }],
      ownerId: 'dono',
      isOnline: () => true
    })
    expect(groups.map((g) => g.key)).toEqual(['members'])
  })

  it('funciona sem lista de cargos (servidor antigo)', () => {
    const groups = groupMembers({
      members: [{ user_id: 'a' }, { user_id: 'b' }],
      roles: [],
      ownerId: 'a',
      isOnline: () => true
    })
    expect(groups.map((g) => g.key)).toEqual(['owner', 'members'])
  })
})

describe('memberColor', () => {
  it('é a cor do cargo mais alto que tem cor', () => {
    expect(memberColor(roles, ['mod', 'vip'])).toBe(0x00ff00)
    expect(memberColor(roles, ['vip', 'artista'])).toBe(0xff00ff)
  })

  it('pula cargos sem cor, mesmo mais altos', () => {
    expect(memberColor(roles, ['sem-cor', 'artista'])).toBe(0x0000ff)
  })

  it('é null sem cargos coloridos', () => {
    expect(memberColor(roles, [])).toBeNull()
    expect(memberColor(roles, undefined)).toBeNull()
    expect(memberColor(roles, ['sem-cor'])).toBeNull()
  })
})

describe('serverMemberColorCss', () => {
  it('retorna a cor CSS (#rrggbb) do cargo primário (mais alto com cor) do membro no servidor', () => {
    expect(
      serverMemberColorCss({
        serverId: 's1',
        currentServerId: 's1',
        userId: 'vipmod',
        members,
        roles
      })
    ).toBe('#00ff00')
    expect(
      serverMemberColorCss({
        serverId: 's1',
        currentServerId: 's1',
        userId: 'artista',
        members,
        roles
      })
    ).toBe('#0000ff')
  })

  it('retorna undefined para membro sem cargo colorido ou fora do servidor', () => {
    expect(
      serverMemberColorCss({
        serverId: 's1',
        currentServerId: 's1',
        userId: 'ana',
        members,
        roles
      })
    ).toBeUndefined()
    expect(
      serverMemberColorCss({
        serverId: 's1',
        currentServerId: 's1',
        userId: 'desconhecido',
        members,
        roles
      })
    ).toBeUndefined()
  })

  it('retorna undefined fora de servidor (DM/grupo) ou quando currentServerId diverge', () => {
    expect(
      serverMemberColorCss({
        serverId: undefined,
        currentServerId: 's1',
        userId: 'vipmod',
        members,
        roles
      })
    ).toBeUndefined()
    expect(
      serverMemberColorCss({
        serverId: 's2',
        currentServerId: 's1',
        userId: 'vipmod',
        members,
        roles
      })
    ).toBeUndefined()
  })
})
