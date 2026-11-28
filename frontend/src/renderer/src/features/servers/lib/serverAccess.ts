import {
  Perm,
  canActOn,
  canEditRolesOf,
  canManageNicknameOf,
  canManageRole,
  canModerateVoice,
  computeBase,
  computeChannel,
  everyoneRole,
  has,
  highestPosition,
  rolesOfMember,
  type ChannelKind,
  type ChannelOverwrite,
  type Role
} from './permissions'

/** O mínimo que o cálculo precisa de cada coisa (os tipos da API satisfazem). */
interface AccessMember {
  user_id: string
  role_ids?: string[]
}
interface AccessChannel {
  id: string
  type?: string
  overwrites?: ChannelOverwrite[]
}

export interface ServerAccessInput {
  ownerId: string | undefined
  meId: string | undefined
  members: AccessMember[]
  roles: Role[]
  channels: AccessChannel[]
}

/**
 * O que a pessoa pode no servidor aberto. É o mesmo cálculo do backend; o app
 * só usa para mostrar ou travar botões — quem decide de verdade é o servidor.
 */
export interface ServerAccess {
  isOwner: boolean
  /** Permissões no servidor (sem olhar canal). */
  perms: number
  /** Posição do cargo mais alto (0 = só @everyone). */
  highest: number
  /** Cargos que a pessoa tem (sem o @everyone), do mais alto para o mais baixo. */
  myRoles: Role[]
  can: (want: number) => boolean
  /** Permissões num canal (0 se não vê). */
  channelPerms: (channelId: string) => number
  canInChannel: (channelId: string, want: number) => boolean
  /** Posição do cargo mais alto de outro membro. */
  highestOf: (userId: string) => number
  /** Pode expulsar, banir ou aplicar/abrir castigo nessa pessoa (cargo mais alto estritamente maior). */
  canActOnMember: (userId: string) => boolean
  /** Pode silenciar, ensurdecer, desconectar ou mover em voz (cargo mais alto >= alvo, sem imunidade do dono). */
  canModerateVoiceMember: (userId: string) => boolean
  /** Pode dar ou tirar cargos dessa pessoa (os do dono, só o dono). */
  canEditRolesOf: (userId: string) => boolean
  /**
   * Pode mudar o apelido dessa pessoa neste servidor: o próprio com "Alterar
   * apelido"; o dos outros com "Gerenciar apelidos" para mesmo cargo ou menor (dono só ele mesmo).
   */
  canChangeNickname: (userId: string) => boolean
  /** Pode editar/dar esse cargo. */
  canManage: (role: Role) => boolean
  /** Canal com @everyone sem VIEW_CHANNEL. */
  isPrivate: (channelId: string) => boolean
}

export function serverAccess(input: ServerAccessInput): ServerAccess {
  const { ownerId, meId, members, roles, channels } = input
  const everyone = everyoneRole(roles)
  const isOwner = !!meId && meId === ownerId
  const memberById = new Map(members.map((m) => [m.user_id, m]))
  const channelById = new Map(channels.map((c) => [c.id, c]))

  const rolesOf = (userId: string | undefined): Role[] =>
    userId ? rolesOfMember(roles, memberById.get(userId)?.role_ids) : []

  const myRoles = rolesOf(meId)
  // Como no servidor: quem não é membro não tem permissão nenhuma.
  const isMember = !!meId && memberById.has(meId)
  const perms = isMember ? computeBase(ownerId, meId, everyone?.permissions ?? 0, myRoles) : 0
  const highest = highestPosition(myRoles)

  const channelPerms = (channelId: string): number => {
    const ch = channelById.get(channelId)
    if (!ch || !meId || !isMember) return 0
    return computeChannel(
      perms,
      (ch.type ?? 'text') as ChannelKind,
      ch.overwrites ?? [],
      everyone?.id,
      meId,
      memberById.get(meId)?.role_ids ?? []
    )
  }

  const highestOf = (userId: string): number => highestPosition(rolesOf(userId))

  return {
    isOwner,
    perms,
    highest,
    myRoles,
    can: (want) => has(perms, want),
    channelPerms,
    canInChannel: (channelId, want) => has(channelPerms(channelId), want),
    highestOf,
    canActOnMember: (userId) => canActOn(ownerId, meId, userId, highest, highestOf(userId)),
    canModerateVoiceMember: (userId) =>
      canModerateVoice(ownerId, meId, highest, highestOf(userId)),
    canEditRolesOf: (userId) => canEditRolesOf(ownerId, meId, userId),
    canChangeNickname: (userId) =>
      userId === meId
        ? has(perms, Perm.CHANGE_NICKNAME)
        : has(perms, Perm.MANAGE_NICKNAMES) &&
          canManageNicknameOf(ownerId, meId, userId, highest, highestOf(userId)),
    canManage: (role) => canManageRole(isOwner, highest, role.position),
    isPrivate: (channelId) => {
      const ch = channelById.get(channelId)
      if (!ch || !everyone) return false
      return (ch.overwrites ?? []).some(
        (o) =>
          o.target_type === 'role' &&
          o.target_id === everyone.id &&
          (o.deny & Perm.VIEW_CHANNEL) !== 0
      )
    }
  }
}
