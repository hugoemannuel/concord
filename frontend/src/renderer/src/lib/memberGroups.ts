import { roleColorCss, rolesOfMember, type Role } from './permissions'

export interface GroupableMember {
  user_id: string
  role_ids?: string[]
}

export interface MemberGroup<T extends GroupableMember> {
  /** Chave estável para o React: "owner", "role:<id>", "members" ou "offline". */
  key: string
  title: string
  /** Cor do cargo (CSS) quando o grupo é de um cargo colorido. */
  roleId?: string
  members: T[]
}

/** Cor do cargo mais alto do membro que tem cor (o nome na lista usa ela). */
export function memberColor(roles: Role[], roleIds: string[] | undefined): number | null {
  for (const role of rolesOfMember(roles, roleIds)) {
    if (role.color != null) return role.color
  }
  return null
}

/**
 * Cor CSS (#rrggbb) do cargo mais alto com cor que a pessoa tem no servidor.
 * Devolve undefined fora de servidor, se o servidor não é o aberto, ou se o
 * membro não tem cargo colorido.
 */
export function serverMemberColorCss(opts: {
  serverId: string | null | undefined
  currentServerId: string | null | undefined
  userId: string | null | undefined
  members: GroupableMember[]
  roles: Role[]
}): string | undefined {
  const { serverId, currentServerId, userId, members, roles } = opts
  if (!serverId || !userId || currentServerId !== serverId) return undefined
  const member = members.find((m) => m.user_id === userId)
  if (!member) return undefined
  return roleColorCss(memberColor(roles, member.role_ids))
}

/**
 * Agrupa a lista de membros como o Discord: o dono em cima; quem está online
 * separado por cargo "exibido separadamente" (do mais alto para o mais baixo,
 * cada pessoa só no grupo do seu cargo mais alto desses); os demais online em
 * "Membros"; e todos os offline no fim.
 */
export function groupMembers<T extends GroupableMember>(opts: {
  members: T[]
  roles: Role[]
  ownerId: string | undefined
  isOnline: (userId: string) => boolean
}): MemberGroup<T>[] {
  const { members, roles, ownerId, isOnline } = opts
  const hoisted = roles
    .filter((r) => r.hoist && !r.is_default)
    .sort((a, b) => {
      if (!!a.is_system !== !!b.is_system) return a.is_system ? 1 : -1
      return b.position - a.position
    })

  const online = members.filter((m) => isOnline(m.user_id))
  const offline = members.filter((m) => !isOnline(m.user_id))

  const groups: MemberGroup<T>[] = []
  const owner = online.filter((m) => m.user_id === ownerId)
  if (owner.length > 0) {
    groups.push({ key: 'owner', title: 'Dono do Servidor', members: owner })
  }

  const rest = online.filter((m) => m.user_id !== ownerId)
  const placed = new Set<string>()
  for (const role of hoisted) {
    const inRole = rest.filter((m) => !placed.has(m.user_id) && m.role_ids?.includes(role.id))
    if (inRole.length === 0) continue
    for (const m of inRole) placed.add(m.user_id)
    groups.push({ key: `role:${role.id}`, title: role.name, roleId: role.id, members: inRole })
  }

  const regular = rest.filter((m) => !placed.has(m.user_id))
  if (regular.length > 0) {
    groups.push({ key: 'members', title: 'Membros', members: regular })
  }
  if (offline.length > 0) {
    groups.push({ key: 'offline', title: 'Offline', members: offline })
  }
  return groups
}
