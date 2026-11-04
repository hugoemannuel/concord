import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ALL_PERMISSIONS,
  DEFAULT_EVERYONE,
  Perm,
  canActOn,
  canDisconnectMember,
  canEditRolesOf,
  canMoveMember,
  canGrant,
  canManageNicknameOf,
  canManageRole,
  computeBase,
  computeChannel,
  has,
  highestPosition,
  normalize,
  parseColorCss,
  permissionError,
  roleColorCss,
  rolesOfMember,
  type ChannelKind,
  type ChannelOverwrite,
  type Role
} from './permissions'

// Os mesmos casos rodam no backend (permission/vectors_test.go): os dois lados
// têm que calcular igual.
interface VectorOverwrite {
  target_type: 'role' | 'member'
  target_id: string
  allow: string[]
  deny: string[]
}

interface Vectors {
  bits: Record<string, number>
  defaults: { everyone: string[] }
  compute: {
    name: string
    owner_id: string
    user_id: string
    everyone: string[]
    roles: { id: string; position: number; permissions: string[] }[]
    member_roles: string[]
    channel: {
      type: ChannelKind
      overwrites: {
        target_type: 'role' | 'member'
        target_id: string
        allow: string[]
        deny: string[]
      }[]
    }
    expect_base: string[]
    expect_channel: string[]
  }[]
  category_gate: {
    name: string
    owner_id: string
    user_id: string
    everyone: string[]
    roles: { id: string; position: number; permissions: string[] }[]
    member_roles: string[]
    category: { overwrites: VectorOverwrite[] }
    channel: { type: ChannelKind; overwrites: VectorOverwrite[] }
    expect_category: boolean
    expect_channel: string[]
  }[]
  can_act_on: {
    name: string
    owner_id: string
    actor: string
    target: string
    actor_highest: number
    target_highest: number
    expect: boolean
  }[]
  can_manage_role: {
    name: string
    is_owner: boolean
    actor_highest: number
    role_position: number
    expect: boolean
  }[]
  can_edit_roles_of: {
    name: string
    owner_id: string
    actor: string
    target: string
    expect: boolean
  }[]
  can_grant: { name: string; actor: string[]; changed: string[]; expect: boolean }[]
}

const vectors: Vectors = JSON.parse(
  readFileSync(
    new URL('../../../../../../../backend/internal/permission/testdata/vectors.json', import.meta.url),
    'utf8'
  )
)

const bits = (names: string[]): number =>
  names.reduce((sum, n) => {
    if (n === 'ALL') return (sum | ALL_PERMISSIONS) >>> 0
    const bit = vectors.bits[n]
    if (bit === undefined) throw new Error(`permissão desconhecida ${n}`)
    return (sum | bit) >>> 0
  }, 0)

describe('bits compartilhados com o backend', () => {
  it('têm os mesmos nomes e valores', () => {
    expect(Perm).toEqual(vectors.bits)
  })

  it('os padrões batem com os do servidor', () => {
    expect(DEFAULT_EVERYONE).toBe(bits(vectors.defaults.everyone))
  })

  it('cabem em 32 bits (bitwise do JS) e saem sem sinal', () => {
    expect(ALL_PERMISSIONS).toBe(2 ** 32 - 1)
    expect(Perm.USE_EXTERNAL_EMOJIS).toBe(2 ** 31)
    expect(DEFAULT_EVERYONE).toBeGreaterThan(0)
  })

  it('normalize descarta bits desconhecidos e devolve sem sinal', () => {
    expect(normalize(ALL_PERMISSIONS | (1 << 14) | (1 << 29))).toBe(ALL_PERMISSIONS)
    expect(normalize(-2147483648)).toBe(Perm.USE_EXTERNAL_EMOJIS)
    expect(normalize(2 ** 32 + Perm.VIEW_CHANNEL)).toBe(Perm.VIEW_CHANNEL)
  })

  it('has reconhece o bit 31, com ou sem sinal', () => {
    const perms = (Perm.VIEW_CHANNEL | Perm.USE_EXTERNAL_EMOJIS) >>> 0
    expect(has(perms, Perm.USE_EXTERNAL_EMOJIS)).toBe(true)
    expect(has(perms | 0, Perm.USE_EXTERNAL_EMOJIS)).toBe(true)
    expect(has(perms, (Perm.VIEW_CHANNEL | Perm.USE_EXTERNAL_EMOJIS) >>> 0)).toBe(true)
    expect(has(Perm.VIEW_CHANNEL, Perm.USE_EXTERNAL_EMOJIS)).toBe(false)
  })
})

// Quem não vê a categoria não tem nada nos canais dela. O app recebe a lista já filtrada,
// mas a conta é a mesma: a da categoria é a de um canal, e bloqueia a do canal.
describe('categoria bloqueia os canais (casos do backend)', () => {
  for (const tc of vectors.category_gate) {
    it(tc.name, () => {
      const roles: Role[] = tc.roles.map((r) => ({
        id: r.id,
        server_id: 's',
        name: r.id,
        color: null,
        position: r.position,
        permissions: bits(r.permissions),
        hoist: false,
        is_default: false
      }))
      const base = computeBase(tc.owner_id, tc.user_id, bits(tc.everyone), rolesOfMember(roles, tc.member_roles))
      const inChannel = (overwrites: VectorOverwrite[]): number =>
        computeChannel(
          base,
          tc.channel.type,
          overwrites.map((o) => ({ target_type: o.target_type, target_id: o.target_id, allow: bits(o.allow), deny: bits(o.deny) })),
          'everyone',
          tc.user_id,
          tc.member_roles
        )
      const seesCategory = (inChannel(tc.category.overwrites) & Perm.VIEW_CHANNEL) !== 0
      expect(seesCategory).toBe(tc.expect_category)
      expect(seesCategory ? inChannel(tc.channel.overwrites) : 0).toBe(bits(tc.expect_channel))
    })
  }
})

describe('computeBase / computeChannel (casos do backend)', () => {
  for (const tc of vectors.compute) {
    it(tc.name, () => {
      const everyone: Role = {
        id: 'everyone',
        server_id: 's',
        name: '@everyone',
        color: null,
        position: 0,
        permissions: bits(tc.everyone),
        hoist: false,
        is_default: true
      }
      const roles: Role[] = [
        everyone,
        ...tc.roles.map((r) => ({
          id: r.id,
          server_id: 's',
          name: r.id,
          color: null,
          position: r.position,
          permissions: bits(r.permissions),
          hoist: false,
          is_default: false
        }))
      ]
      const own = rolesOfMember(roles, tc.member_roles)
      const base = computeBase(tc.owner_id, tc.user_id, everyone.permissions, own)
      expect(base).toBe(bits(tc.expect_base))

      const overwrites: ChannelOverwrite[] = tc.channel.overwrites.map((o) => ({
        target_type: o.target_type,
        target_id: o.target_id,
        allow: bits(o.allow),
        deny: bits(o.deny)
      }))
      const channel = computeChannel(
        base,
        tc.channel.type,
        overwrites,
        everyone.id,
        tc.user_id,
        tc.member_roles
      )
      expect(channel).toBe(bits(tc.expect_channel))
    })
  }
})

describe('hierarquia (casos do backend)', () => {
  for (const tc of vectors.can_act_on) {
    it(`canActOn: ${tc.name}`, () => {
      expect(canActOn(tc.owner_id, tc.actor, tc.target, tc.actor_highest, tc.target_highest)).toBe(
        tc.expect
      )
    })
  }
  for (const tc of vectors.can_edit_roles_of) {
    it(`canEditRolesOf: ${tc.name}`, () => {
      expect(canEditRolesOf(tc.owner_id, tc.actor, tc.target)).toBe(tc.expect)
    })
  }
  for (const tc of vectors.can_manage_role) {
    it(`canManageRole: ${tc.name}`, () => {
      expect(canManageRole(tc.is_owner, tc.actor_highest, tc.role_position)).toBe(tc.expect)
    })
  }

  it('canManageNicknameOf permite mesmo cargo ou superior, mas nunca o dono a menos que seja o dono', () => {
    expect(canManageNicknameOf('dono', 'mod1', 'mod2', 2, 2)).toBe(true)
    expect(canManageNicknameOf('dono', 'chefe', 'mod', 3, 2)).toBe(true)
    expect(canManageNicknameOf('dono', 'mod', 'chefe', 2, 3)).toBe(false)
    expect(canManageNicknameOf('dono', 'chefe', 'dono', 3, 0)).toBe(false)
    expect(canManageNicknameOf('dono', 'dono', 'dono', 0, 0)).toBe(true)
    expect(canManageNicknameOf('dono', 'dono', 'chefe', 0, 3)).toBe(true)
    expect(canManageNicknameOf('dono', undefined, 'mod', 0, 2)).toBe(false)
  })

  it('canMoveMember permite mesmo cargo ou inferior, mas nunca o dono a menos que seja o dono', () => {
    expect(canMoveMember('dono', 'mod1', 'mod2', 2, 2)).toBe(true)
    expect(canMoveMember('dono', 'chefe', 'mod', 3, 2)).toBe(true)
    expect(canMoveMember('dono', 'mod', 'chefe', 2, 3)).toBe(false)
    expect(canMoveMember('dono', 'chefe', 'dono', 3, 0)).toBe(false)
    expect(canMoveMember('dono', 'dono', 'chefe', 0, 3)).toBe(true)
    expect(canMoveMember('dono', undefined, 'mod', 0, 2)).toBe(false)
  })
  it('canDisconnectMember permite mesmo cargo ou inferior, mas nunca o dono a menos que seja o dono', () => {
    expect(canDisconnectMember('dono', 'mod1', 'mod2', 2, 2)).toBe(true)
    expect(canDisconnectMember('dono', 'chefe', 'mod', 3, 2)).toBe(true)
    expect(canDisconnectMember('dono', 'mod', 'chefe', 2, 3)).toBe(false)
    expect(canDisconnectMember('dono', 'chefe', 'dono', 3, 0)).toBe(false)
    expect(canDisconnectMember('dono', 'dono', 'chefe', 0, 3)).toBe(true)
    expect(canDisconnectMember('dono', undefined, 'mod', 0, 2)).toBe(false)
  })
  for (const tc of vectors.can_grant) {
    it(`canGrant: ${tc.name}`, () => {
      expect(canGrant(bits(tc.actor), bits(tc.changed))).toBe(tc.expect)
    })
  }
})

describe('has', () => {
  it('exige todos os bits pedidos', () => {
    const perms = Perm.VIEW_CHANNEL | Perm.SEND_MESSAGES
    expect(has(perms, Perm.VIEW_CHANNEL)).toBe(true)
    expect(has(perms, Perm.VIEW_CHANNEL | Perm.SEND_MESSAGES)).toBe(true)
    expect(has(perms, Perm.VIEW_CHANNEL | Perm.MANAGE_ROLES)).toBe(false)
    expect(has(perms, 0)).toBe(true)
  })
})

describe('cargos do membro', () => {
  const role = (id: string, position: number, extra: Partial<Role> = {}): Role => ({
    id,
    server_id: 's',
    name: id,
    color: null,
    position,
    permissions: 0,
    hoist: false,
    is_default: false,
    ...extra
  })
  const roles = [
    role('everyone', 0, { is_default: true }),
    role('a', 1),
    role('b', 3),
    role('c', 2)
  ]

  it('vêm do mais alto para o mais baixo e sem o @everyone', () => {
    expect(rolesOfMember(roles, ['a', 'b', 'c', 'everyone']).map((r) => r.id)).toEqual([
      'b',
      'c',
      'a'
    ])
  })

  it('ignora ids que não existem e aceita lista ausente', () => {
    expect(rolesOfMember(roles, ['nada']).length).toBe(0)
    expect(rolesOfMember(roles, undefined).length).toBe(0)
  })

  it('highestPosition é 0 sem cargos', () => {
    expect(highestPosition([])).toBe(0)
    expect(highestPosition(rolesOfMember(roles, ['a', 'b']))).toBe(3)
  })
})

describe('textos', () => {
  it('traduz os códigos de erro do servidor', () => {
    const codes = [
      'missing_permission',
      'not_member',
      'role_hierarchy',
      'cannot_grant',
      'banned',
      'everyone_role',
      'bot_role',
      'too_many_roles',
      'role_not_found',
      'member_not_found',
      'ban_not_found',
      'owner_cannot_leave',
      'self',
      'channel_not_found',
      'invalid_target',
      'invalid_nickname',
      'system_channel'
    ]
    for (const code of codes) {
      expect(permissionError(code)).not.toBe('Algo deu errado')
    }
    expect(permissionError('desconhecido', 'padrão')).toBe('padrão')
    expect(permissionError(undefined)).toBe('Algo deu errado')
  })
})

describe('cores', () => {
  it('converte entre número e CSS', () => {
    expect(roleColorCss(0xff00aa)).toBe('#ff00aa')
    expect(roleColorCss(0x0000ff)).toBe('#0000ff')
    expect(roleColorCss(null)).toBeUndefined()
    expect(parseColorCss('#ff00aa')).toBe(0xff00aa)
    expect(parseColorCss('FF00AA')).toBe(0xff00aa)
    expect(parseColorCss('#fff')).toBeNull()
    expect(parseColorCss('azul')).toBeNull()
  })
})
