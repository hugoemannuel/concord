/**
 * Permissões de servidor no estilo Discord. Espelho exato de
 * backend/internal/permission (os dois rodam os mesmos casos de
 * backend/internal/permission/testdata/vectors.json): o app só esconde ou
 * trava o que o servidor de fato recusaria.
 *
 * As permissões são bits. Todos ficam abaixo de 1<<31, então o bitwise do JS
 * funciona sem BigInt.
 */

export const Perm = {
  VIEW_CHANNEL: 1 << 0,
  MANAGE_CHANNELS: 1 << 1,
  MANAGE_ROLES: 1 << 2,
  MANAGE_SERVER: 1 << 3,
  CREATE_INVITE: 1 << 4,
  KICK_MEMBERS: 1 << 5,
  BAN_MEMBERS: 1 << 6,
  ADMINISTRATOR: 1 << 7,
  SEND_MESSAGES: 1 << 8,
  ATTACH_FILES: 1 << 9,
  ADD_REACTIONS: 1 << 10,
  MENTION_EVERYONE: 1 << 11,
  MANAGE_MESSAGES: 1 << 12,
  READ_MESSAGE_HISTORY: 1 << 13,
  /** Ver o registro de auditoria do servidor (fora do @everyone; ADR 0036). */
  VIEW_AUDIT_LOG: 1 << 14,
  /** Enviar emojis personalizados ao servidor (ADR 0028). */
  ADD_EMOJIS: 1 << 15,
  CONNECT: 1 << 16,
  SPEAK: 1 << 17,
  STREAM: 1 << 18,
  MUTE_MEMBERS: 1 << 19,
  DEAFEN_MEMBERS: 1 << 20,
  MOVE_MEMBERS: 1 << 21,
  USE_SOUNDBOARD: 1 << 22,
  MANAGE_EXPRESSIONS: 1 << 23,
  DISCONNECT_MEMBERS: 1 << 24,
  /** Gerar link de visitante para a call (fora do @everyone; ADR 0017). */
  INVITE_GUESTS: 1 << 25,
  CHANGE_NICKNAME: 1 << 26,
  MANAGE_NICKNAMES: 1 << 27,
  ADD_SOUNDS: 1 << 28,
  ADD_STICKERS: 1 << 29,
  SEND_TTS_MESSAGES: 1 << 30
} as const

export type PermName = keyof typeof Perm

/** Soma de todas as permissões conhecidas (dono e ADMINISTRATOR). */
export const ALL_PERMISSIONS: number = Object.values(Perm).reduce((sum, bit) => sum | bit, 0)

/**
 * O que todo membro faz num servidor novo (igual ao backend). "Alterar apelido"
 * vem ligado, como no Discord; nos servidores antigos a migration 000039 ligou.
 * "Adicionar sons", "Adicionar figurinhas" (migration 000125), "Adicionar emojis" (000174) e "Enviar
 * mensagens TTS" (a 000127 ligou nos antigos; ver docs/adr/0012-tts-no-cliente.md).
 */
export const DEFAULT_EVERYONE: number =
  Perm.VIEW_CHANNEL |
  Perm.SEND_MESSAGES |
  Perm.ATTACH_FILES |
  Perm.ADD_REACTIONS |
  Perm.READ_MESSAGE_HISTORY |
  Perm.CREATE_INVITE |
  Perm.CONNECT |
  Perm.SPEAK |
  Perm.STREAM |
  Perm.USE_SOUNDBOARD |
  Perm.CHANGE_NICKNAME |
  Perm.ADD_SOUNDS |
  Perm.ADD_STICKERS |
  Perm.SEND_TTS_MESSAGES |
  Perm.ADD_EMOJIS

export interface Role {
  id: string
  server_id: string
  name: string
  /** Cor RGB (0xRRGGBB) ou null (sem cor). */
  color: number | null
  /** Hierarquia: maior = mais alto; o @everyone é 0. */
  position: number
  permissions: number
  /** "Exibir membros separadamente" na lista. */
  hoist: boolean
  /** É o @everyone. */
  is_default: boolean
  /** É o cargo fixo de sistema (Bots). */
  is_system?: boolean
}

export type OverwriteTarget = 'role' | 'member'

/** Libera (allow) ou nega (deny) bits num canal para um cargo ou membro. */
export interface ChannelOverwrite {
  channel_id?: string
  target_type: OverwriteTarget
  target_id: string
  allow: number
  deny: number
}

export type ChannelKind = 'text' | 'voice'

export const has = (perms: number, want: number): boolean => (perms & want) === want

/** Descarta bits desconhecidos. */
export const normalize = (perms: number): number => perms & ALL_PERMISSIONS

export const everyoneRole = (roles: Role[]): Role | undefined => roles.find((r) => r.is_default)

/** Cargos (sem o @everyone) que o membro tem, do mais alto para o mais baixo. */
export function rolesOfMember(roles: Role[], roleIds: string[] | undefined): Role[] {
  const own = new Set(roleIds ?? [])
  return roles.filter((r) => !r.is_default && own.has(r.id)).sort((a, b) => b.position - a.position)
}

/**
 * Permissões do membro no servidor. O dono e quem tem ADMINISTRATOR ficam com
 * tudo; os demais somam o @everyone com os cargos que têm.
 */
export function computeBase(
  ownerId: string | undefined,
  userId: string | undefined,
  everyone: number,
  memberRoles: Role[]
): number {
  if (userId && userId === ownerId) return ALL_PERMISSIONS
  let perms = everyone
  for (const r of memberRoles) perms |= r.permissions
  if (perms & Perm.ADMINISTRATOR) return ALL_PERMISSIONS
  return normalize(perms)
}

/**
 * Aplica as sobrescritas do canal por cima das permissões base, na ordem do
 * Discord: @everyone, depois os cargos do membro (somados) e por último o
 * próprio membro. Em cada etapa, deny tira e allow põe.
 */
export function computeChannel(
  base: number,
  channelType: ChannelKind,
  overwrites: ChannelOverwrite[],
  everyoneRoleId: string | undefined,
  userId: string | undefined,
  roleIds: string[]
): number {
  if (base & Perm.ADMINISTRATOR) return ALL_PERMISSIONS

  let perms = base
  const own = new Set(roleIds)

  for (const o of overwrites) {
    if (o.target_type === 'role' && o.target_id === everyoneRoleId) {
      perms &= ~o.deny
      perms |= o.allow
    }
  }

  let allow = 0
  let deny = 0
  for (const o of overwrites) {
    if (o.target_type === 'role' && o.target_id !== everyoneRoleId && own.has(o.target_id)) {
      allow |= o.allow
      deny |= o.deny
    }
  }
  perms &= ~deny
  perms |= allow

  for (const o of overwrites) {
    if (o.target_type === 'member' && o.target_id === userId) {
      perms &= ~o.deny
      perms |= o.allow
    }
  }

  return implicitChannel(normalize(perms), channelType)
}

/**
 * Sem ver o canal não se faz nada nele; sem enviar não anexa, menciona
 * todos nem manda TTS (no texto e no chat do canal de voz); em voz, sem conectar não fala,
 * transmite nem modera.
 */
function implicitChannel(perms: number, channelType: ChannelKind): number {
  if (!(perms & Perm.VIEW_CHANNEL)) return 0
  if (!(perms & Perm.SEND_MESSAGES)) {
    perms &= ~(Perm.ATTACH_FILES | Perm.MENTION_EVERYONE | Perm.SEND_TTS_MESSAGES)
  }
  if (channelType === 'voice' && !(perms & Perm.CONNECT)) {
    perms &= ~(
      Perm.SPEAK |
      Perm.STREAM |
      Perm.MUTE_MEMBERS |
      Perm.DEAFEN_MEMBERS |
      Perm.MOVE_MEMBERS |
      Perm.DISCONNECT_MEMBERS |
      Perm.USE_SOUNDBOARD
    )
  }
  return perms
}

/** Só se liga ou desliga o que o ator mesmo tem (ADMINISTRATOR pode tudo). */
export function canGrant(actorPerms: number, changed: number): boolean {
  if (actorPerms & Perm.ADMINISTRATOR) return true
  return (normalize(changed) & ~actorPerms) === 0
}

/** Posição do cargo mais alto da lista (0 = só @everyone). */
export function highestPosition(roles: Role[]): number {
  return roles.reduce((highest, r) => Math.max(highest, r.position), 0)
}

/** O dono mexe em qualquer cargo; os demais só nos que estão abaixo do seu mais alto. */
export function canManageRole(
  isOwner: boolean,
  actorHighest: number,
  rolePosition: number
): boolean {
  return isOwner || actorHighest > rolePosition
}

/**
 * O ator pode dar ou tirar cargos do alvo? Os cargos do dono só ele mesmo mexe
 * (em si, qualquer cargo); nos demais, o próprio ator incluso, vale só a
 * hierarquia de cada cargo (canManageRole).
 */
export function canEditRolesOf(
  ownerId: string | undefined,
  actorId: string | undefined,
  targetId: string
): boolean {
  return targetId !== ownerId || actorId === ownerId
}

/**
 * O ator pode expulsar, banir, silenciar, mover ou trocar cargos do alvo? O
 * dono nunca é alvo; ninguém age sobre si mesmo; fora o dono, só quem tem cargo
 * mais alto que o do alvo.
 */
export function canActOn(
  ownerId: string | undefined,
  actorId: string | undefined,
  targetId: string,
  actorHighest: number,
  targetHighest: number
): boolean {
  if (!actorId || targetId === ownerId || actorId === targetId) return false
  if (actorId === ownerId) return true
  return actorHighest > targetHighest
}

/**
 * Pode alterar o apelido de outro membro: mesmo cargo ou superior.
 * Alvo não pode ser o dono (exceto se o próprio ator for o dono).
 */
export function canManageNicknameOf(
  ownerId: string | undefined,
  actorId: string | undefined,
  targetId: string,
  actorHighest: number,
  targetHighest: number
): boolean {
  if (!actorId) return false
  if (targetId === ownerId) return actorId === ownerId
  if (actorId === ownerId) return true
  return actorHighest >= targetHighest
}

/**
 * Pode desconectar outro membro da voz: mesmo cargo ou inferior.
 * Alvo não pode ser o dono (exceto se o próprio ator for o dono).
 */
export function canDisconnectMember(
  ownerId: string | undefined,
  actorId: string | undefined,
  targetId: string,
  actorHighest: number,
  targetHighest: number
): boolean {
  if (!actorId) return false
  if (targetId === ownerId) return actorId === ownerId
  if (actorId === ownerId) return true
  return actorHighest >= targetHighest
}

/**
 * Pode mover outro membro entre canais de voz: mesmo cargo ou inferior.
 * Alvo não pode ser o dono (exceto se o próprio ator for o dono).
 */
export function canMoveMember(
  ownerId: string | undefined,
  actorId: string | undefined,
  targetId: string,
  actorHighest: number,
  targetHighest: number
): boolean {
  if (!actorId) return false
  if (targetId === ownerId) return actorId === ownerId
  if (actorId === ownerId) return true
  return actorHighest >= targetHighest
}

export {
  PERMISSION_GROUPS,
  channelPermissionGroups,
  type PermissionInfo,
  type PermissionGroup
} from './permissionCatalog'

const PERMISSION_ERROR_MESSAGES: Record<string, string> = {
  missing_permission: 'Você não tem permissão para isso.',
  not_member: 'Você não faz parte deste servidor.',
  role_hierarchy: 'Você só pode fazer isso com cargos e pessoas abaixo do seu cargo mais alto.',
  owner_roles: 'Só o dono do servidor mexe nos cargos dele.',
  cannot_grant: 'Você não pode dar ou tirar uma permissão que você mesmo não tem.',
  banned: 'Você foi banido deste servidor.',
  everyone_role: 'O cargo @everyone não pode ser renomeado, movido nem apagado.',
  bot_role: 'O cargo Bots é fixo do servidor e não pode ser apagado, movido nem atribuído a outros usuários.',
  too_many_roles: 'O servidor atingiu o limite de cargos.',
  role_not_found: 'Esse cargo não existe mais.',
  member_not_found: 'Essa pessoa não está mais no servidor.',
  ban_not_found: 'Essa pessoa não está banida.',
  owner_cannot_leave: 'O dono não pode sair do servidor. Apague o servidor ou passe o cargo antes.',
  self: 'Você não pode fazer isso consigo mesmo.',
  channel_not_found: 'Esse canal não existe ou você não tem acesso a ele.',
  invalid_target: 'Cargo ou membro não encontrado neste servidor.',
  invalid_nickname: 'Apelido inválido: até 32 caracteres, sem caracteres invisíveis ou de controle.',
  system_channel: 'Esse canal é fixo do servidor: não pode ser alterado nem ter mensagens excluídas.'
}
/** Mensagem em português para os códigos de erro de permissão do servidor. */
export function permissionError(code: string | undefined, fallback = 'Algo deu errado'): string {
  if (!code) return fallback
  return PERMISSION_ERROR_MESSAGES[code] ?? fallback
}

/** Cor do cargo em CSS (#rrggbb), ou undefined se não tem. */
export function roleColorCss(color: number | null | undefined): string | undefined {
  if (color == null || color < 0) return undefined
  return `#${color.toString(16).padStart(6, '0')}`
}

/** Converte "#rrggbb" do seletor de cor para o número guardado no servidor. */
export function parseColorCss(css: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(css.trim())
  return match ? parseInt(match[1], 16) : null
}
