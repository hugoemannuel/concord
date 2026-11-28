import router from '../../../app/router'
import { canMoveVoiceUser, voiceChannelOf } from '../../call/lib/voiceMove'
import { useCallStore } from '../../call/store/callStore'
import { useServerAccess } from '../../servers/hooks/useServerAccess'
import { Perm, type Role } from '../../servers/lib/permissions'
import { useServerStore } from '../../servers/store/serverStore'
import {
  canChangeServerNickname,
  computeGivableRoles,
  computeServerModerationPerms,
  computeVoiceMoveTargets,
  resolveTargetUsername
} from '../lib/userMenuActions'
import type { UserMenuTarget } from '../store/userMenuStore'

export interface StandardUserMenuModel {
  server: ReturnType<typeof useServerStore.getState>['currentServer']
  member: ReturnType<typeof useServerStore.getState>['currentMembers'][number] | undefined
  username?: string
  inCallWith: boolean
  givable: Role[]
  voiceState?: { server_muted?: boolean; server_deafened?: boolean }
  voiceCallId?: string
  moveTargets: ReturnType<typeof computeVoiceMoveTargets>
  canNick: boolean
  modPerms: ReturnType<typeof computeServerModerationPerms>
}

/**
 * O que o menu de contexto de um usuário qualquer pode mostrar: servidor,
 * membro, cargos atribuíveis, canais para mover e permissões de moderação.
 * Só lê os stores e deriva; quem age (mover, moderar) é o componente.
 */
export function useStandardUserMenuModel(
  target: UserMenuTarget,
  meId?: string
): StandardUserMenuModel {
  const server = useServerStore((s) => s.currentServer)
  const member = useServerStore((s) => s.currentMembers.find((m) => m.user_id === target.userId))
  const roles = useServerStore((s) => s.roles)
  const channels = useServerStore((s) => s.channels)
  const serverCalls = useCallStore((s) => s.serverCalls)
  const access = useServerAccess()

  const inCallWith = useCallStore(
    (s) => s.status === 'active' && s.participants.some((p) => p.id === target.userId)
  )
  const callUsername = useCallStore(
    (s) => s.participants.find((p) => p.id === target.userId)?.username
  )
  const username = resolveTargetUsername(target.username, member?.username, callUsername)
  const inServer = Boolean(server && member)
  const canAct = inServer && access.canActOnMember(target.userId)
  const canModVoice = Boolean(server && access.canModerateVoiceMember(target.userId))
  // Os cargos do dono só o próprio dono mexe.
  const givable: Role[] = computeGivableRoles(
    inServer && access.canEditRolesOf(target.userId),
    roles,
    access
  )

  const fromChannel = voiceChannelOf(serverCalls, target.userId)
  const voiceCall = fromChannel ? serverCalls[fromChannel] : undefined
  const voiceState = voiceCall?.participants.find((p) => p.user_id === target.userId)
  const voiceCallId = voiceCall?.call?.id

  const inFrom = (want: number): boolean =>
    Boolean(fromChannel && voiceCallId && access.canInChannel(fromChannel, want))

  const canMove = Boolean(
    fromChannel &&
    canMoveVoiceUser({
      meId,
      canMoveMembers: access.canInChannel(fromChannel, Perm.MOVE_MEMBERS),
      canModerateTarget: canModVoice
    })
  )
  const canNick = canChangeServerNickname(
    inServer,
    router.state.location.pathname,
    server?.id ?? undefined,
    access.canChangeNickname(target.userId)
  )

  return {
    server,
    member,
    username,
    inCallWith,
    givable,
    voiceState,
    voiceCallId,
    moveTargets: computeVoiceMoveTargets(fromChannel, channels, canMove),
    canNick,
    modPerms: computeServerModerationPerms(canAct, canModVoice, inFrom, access.can)
  }
}
