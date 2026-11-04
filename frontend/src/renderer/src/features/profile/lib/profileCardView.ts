import type { User } from '../../auth/store/authStore'
import type { MutualServer } from '../../friends/api/friends'
import type { PresenceStatus } from '../../friends/lib/presenceStatus'
import type { PublicUser } from '../../auth/store/authStore'
import { levelTier, type LevelTier } from '../../levels/lib/levels'
import { voiceChannelOf } from '../../call/lib/voiceMove'
import type { Channel } from '../../servers/api/channels'
import type { Server, ServerMember } from '../../servers/api/servers'
import { memberColor } from '../../servers/lib/memberGroups'
import { roleColorCss, rolesOfMember, type Role } from '../../servers/lib/permissions'
import { serverIdFromPath } from '../../servers/lib/serverNames'
import { overlayProfile, type ServerProfile } from '../../serverProfiles/lib/serverProfile'
import type { PublicProfile } from '../api/users'
import type { CardProfile } from '../components/ProfileCardBody'
import type { ProfileCardTarget } from '../store/profileCardStore'
import { formatMemberSince } from './profileCard'
import { isStranger, type ProfileRelationship } from './profileRelationship'

// O que o cartão de perfil mostra, derivado dos stores (sem React).

export const OWNER_STYLE = {
  label: 'Dono do servidor',
  color: '#f59e0b',
  avatar: 'bg-amber-600'
} as const
/** Cor de quem não tem cargo colorido. */
const NO_ROLE_COLOR = '#6366f1'

type CardSource = User | PublicProfile | null | undefined

interface Mutual {
  mutual_friends: PublicUser[]
  mutual_servers: MutualServer[]
}

export interface CardViewInput {
  target: ProfileCardTarget
  me: User | null
  profile?: PublicProfile
  member?: ServerMember
  server: Server | null
  roles: Role[]
  channels: Channel[]
  serverCalls: Parameters<typeof voiceChannelOf>[0]
  pathname: string
  /** Pode trocar o apelido da pessoa no servidor aberto. */
  canChangeNickname: boolean
  /** O perfil da pessoa neste servidor (sem ele, o global). */
  serverProfile?: ServerProfile
  /** Quem olha pediu para ver o perfil global: sem apelido nem perfil do servidor. */
  globalView?: boolean
  level?: number
  online: boolean
  knownStatus?: PresenceStatus
  mutual: Mutual | null
  profileSettled: string | null
  mutualSettled: string | null
}

/** O servidor aberto: apelido, cargos e a cor do cartão. */
export interface MemberContext {
  inServer: boolean
  nickname: string | null
  canNickname: boolean
  isServerOwner: boolean
  memberRoles: Role[]
  /** O banner e o avatar sem foto usam a cor do cargo mais alto que tem cor. */
  role: { color: string; avatar: string }
}

export interface CardInfo {
  tier: LevelTier | null
  level?: number
  salinhaSince: string | null
  serverSince: string | null
  voiceChannel?: Channel
  mutualFriends: PublicUser[]
  mutualServers: MutualServer[]
  /** Amigos e servidores em comum ainda carregando (vêm de outra chamada). */
  mutualLoading: boolean
  hasInfo: boolean
}

export interface ProfileCardView extends MemberContext {
  isMe: boolean
  isBot: boolean
  /** Vínculo comigo: o do perfil carregado ou, antes dele, o de onde o cartão abriu. */
  link?: ProfileRelationship
  /** Sem vínculo (aberto pelo ranking): sem o @ e sem atalhos de DM e amizade. */
  stranger: boolean
  card: CardProfile
  /** Apelido ou nome de exibição. */
  shownName: string
  status: PresenceStatus
  fallbackBanner: string
  /** Primeira carga do perfil: o cartão abre na hora com o que já se sabe. */
  profileLoading: boolean
  info: CardInfo
}

function roleLookOf(isOwner: boolean, roles: Role[], roleIds?: string[]): MemberContext['role'] {
  if (isOwner) return { color: OWNER_STYLE.color, avatar: OWNER_STYLE.avatar }
  return {
    color: roleColorCss(memberColor(roles, roleIds)) ?? NO_ROLE_COLOR,
    avatar: 'bg-indigo-600'
  }
}

export function memberContextOf(input: CardViewInput): MemberContext {
  const { target, server, member, roles } = input
  const inServer = Boolean(server && member)
  // O apelido só vale com o servidor aberto na tela (em DM não existe).
  const nicknameContext = inServer && serverIdFromPath(input.pathname) === server?.id
  const isServerOwner = server?.owner_id === target.userId
  return {
    inServer,
    nickname: nicknameContext && !input.globalView ? (member?.nickname ?? null) : null,
    canNickname: nicknameContext && input.canChangeNickname,
    isServerOwner,
    memberRoles: inServer ? rolesOfMember(roles, member?.role_ids) : [],
    role: roleLookOf(isServerOwner, roles, member?.role_ids)
  }
}

export function cardProfileOf(
  input: CardViewInput,
  source: CardSource,
  nickname: string | null,
  isBot: boolean,
  stranger: boolean
): CardProfile {
  const { target, member } = input
  return {
    id: target.userId,
    display_name: source?.display_name || member?.display_name || target.name,
    name_style: source?.name_style ?? member?.name_style,
    nickname,
    username: stranger ? undefined : source?.username || member?.username || target.username,
    avatar_url: source ? source.avatar_url : member?.avatar_url,
    banner_url: source?.banner_url,
    banner_color: source?.banner_color,
    pronouns: source?.pronouns,
    bio: source?.bio,
    status_text: source?.status_text,
    links: source?.links?.map((l) => l.url) ?? [],
    is_bot: isBot,
    profile_theme: source?.profile_theme
  }
}

export function cardStatusOf(input: CardViewInput, isMe: boolean, isBot: boolean): PresenceStatus {
  // O Maestro não tem websocket: está sempre online.
  if (isBot) return 'online'
  if (isMe) return input.me?.status ?? 'online'
  return input.knownStatus ?? input.profile?.status ?? (input.online ? 'online' : 'offline')
}

type InfoParts = Omit<CardInfo, 'hasInfo'>

export function hasCardInfo(info: InfoParts, inServer: boolean): boolean {
  return Boolean(
    inServer ||
    info.tier ||
    info.salinhaSince ||
    info.voiceChannel ||
    info.mutualFriends.length > 0 ||
    info.mutualServers.length > 0 ||
    info.mutualLoading
  )
}

export function cardInfoOf(
  input: CardViewInput,
  source: CardSource,
  isMe: boolean,
  inServer: boolean
): CardInfo {
  const { target, mutual } = input
  const voiceChannelId = voiceChannelOf(input.serverCalls, target.userId)
  const info: InfoParts = {
    tier: input.level !== undefined ? levelTier(input.level) : null,
    level: input.level,
    salinhaSince: formatMemberSince(source?.created_at),
    serverSince: inServer ? formatMemberSince(input.member?.joined_at) : null,
    voiceChannel: voiceChannelId ? input.channels.find((c) => c.id === voiceChannelId) : undefined,
    mutualFriends: mutual?.mutual_friends ?? [],
    mutualServers: mutual?.mutual_servers ?? [],
    mutualLoading: !isMe && !mutual && input.mutualSettled !== target.userId
  }
  return { ...info, hasInfo: hasCardInfo(info, inServer) }
}

/** Tudo o que o cartão de perfil mostra de uma pessoa. */
export function profileCardView(input: CardViewInput): ProfileCardView {
  const { target, me, profile } = input
  const isMe = target.userId === me?.id
  const isBot = Boolean(profile?.is_bot || input.member?.is_bot)
  const link = profile?.relationship ?? input.target.relationship
  const stranger = !isMe && isStranger(link)
  const context = memberContextOf(input)
  const global = isMe ? me : profile
  const source = global && !input.globalView ? overlayProfile(global, input.serverProfile) : global
  const card = cardProfileOf(input, source, context.nickname, isBot, stranger)
  const info = cardInfoOf(input, source, isMe, context.inServer)
  return {
    ...context,
    isMe,
    isBot,
    link,
    stranger,
    card,
    shownName: context.nickname || card.display_name,
    status: cardStatusOf(input, isMe, isBot),
    fallbackBanner: `linear-gradient(135deg, ${context.role.color}, ${info.tier?.color ?? context.role.color})`,
    profileLoading: !isMe && !profile && input.profileSettled !== target.userId,
    info
  }
}
