import { errorMessage } from '../../../shared/lib/errorMessage'
import router from '../../../app/router'
import { getOrCreateConversationWith, hideConversation } from '../../chat/api/conversations'
import { useProfileCardStore } from '../store/profileCardStore'
import { showToast } from '../../../shared/store/toastStore'
import { friendRequestError } from './relationship'
import { confirmBlock, confirmRemoveFriend } from '../../friends/store/friendActionsStore'
import { streamAudioKey } from '../../call/store/userAudioStore'
import { serverIdFromPath } from '../../servers/lib/serverNames'
import { Perm, type Role } from '../../servers/lib/permissions'
import { assignableRoles } from '../../servers/lib/roleList'

export interface UserMenuActionTarget {
  userId: string
  name: string
  username?: string
  x: number
  y: number
  conversationId?: string
}

export function openUserProfile(target: UserMenuActionTarget): void {
  useProfileCardStore.getState().open({
    userId: target.userId,
    name: target.name,
    username: target.username,
    side: 'right',
    anchor: { top: target.y, left: target.x, right: target.x, bottom: target.y }
  })
}

export function sendDirectMessage(userId: string): void {
  void router.navigate(`/dm/${userId}`)
}

export async function closeDirectMessage(
  conversationId: string,
  userId: string,
  currentPath: string
): Promise<void> {
  try {
    await hideConversation(conversationId)
    if (currentPath === `/dm/${userId}`) {
      void router.navigate('/friends')
    }
  } catch (err) {
    showToast.error(errorMessage(err, 'Não foi possível fechar a DM.'))
  }
}

export async function startUserCall(
  userId: string,
  username: string,
  displayName: string,
  startDMCall: (convId: string, user: { id: string; username: string; display_name: string }) => Promise<unknown>
): Promise<void> {
  try {
    const conv = await getOrCreateConversationWith(userId)
    await router.navigate(`/dm/${userId}`)
    await startDMCall(conv.id, {
      id: userId,
      username,
      display_name: displayName
    })
  } catch (err) {
    showToast.error(errorMessage(err, 'Não foi possível ligar.'))
  }
}

export async function sendUserFriendRequest(
  username: string,
  targetName: string,
  sendRequest: (username: string) => Promise<string>
): Promise<void> {
  try {
    const result = await sendRequest(username)
    showToast.success(
      result === 'accepted'
        ? `Você e ${targetName} agora são amigos.`
        : `Pedido de amizade enviado para ${targetName}.`
    )
  } catch (err) {
    showToast.error(friendRequestError(err))
  }
}

export async function acceptUserFriendRequest(
  username: string,
  accept: (username: string) => Promise<unknown>
): Promise<void> {
  try {
    await accept(username)
  } catch (err) {
    showToast.error(errorMessage(err, 'Não foi possível aceitar.'))
  }
}

export function confirmUserRemoveFriend(userId: string, username: string, name: string): void {
  confirmRemoveFriend({ userId, username, name })
}

export function confirmUserBlock(userId: string, username: string, name: string): void {
  confirmBlock({ userId, username, name })
}

export function unblockUserTarget(
  userId: string,
  unblock: (userId: string) => Promise<unknown>
): void {
  unblock(userId).catch((err) =>
    showToast.error(errorMessage(err, 'Não foi possível desbloquear.'))
  )
}

export interface EditNicknamePromptArgs {
  serverId: string
  userId: string
  name: string
  nickname?: string | null
  displayName?: string | null
  self: boolean
  askNickname: (args: {
    serverId: string
    userId: string
    name: string
    nickname: string | null
    displayName: string
    self: boolean
  }) => void
}

export function promptEditNickname(args: EditNicknamePromptArgs): void {
  args.askNickname({
    serverId: args.serverId,
    userId: args.userId,
    name: args.name,
    nickname: args.nickname ?? null,
    displayName: args.displayName || args.name,
    self: args.self
  })
}

export function computeVoiceMoveTargets(
  fromChannel: string | null | undefined,
  channels: Array<{ id: string; name: string; type: string }>,
  canMove: boolean
): Array<{ id: string; name: string }> {
  if (!fromChannel || !canMove) return []
  return channels.filter((ch) => ch.type === 'voice' && ch.id !== fromChannel)
}

export function getAudioKey(target: { stream?: boolean; userId: string } | null): string {
  if (!target) return ''
  return target.stream ? streamAudioKey(target.userId) : target.userId
}

export function canChangeServerNickname(
  inServer: boolean,
  pathname: string,
  serverId: string | undefined,
  canChange: boolean
): boolean {
  if (!inServer || !serverId) return false
  return serverIdFromPath(pathname) === serverId && canChange
}

export function resolveTargetUsername(
  targetUsername?: string,
  memberUsername?: string,
  callUsername?: string
): string | undefined {
  return targetUsername || memberUsername || callUsername
}

export function computeGivableRoles(
  inServer: boolean,
  roles: Role[],
  access: { isOwner: boolean; highest: number; can: (perm: number) => boolean }
): Role[] {
  if (!inServer) return []
  return assignableRoles(roles, {
    isOwner: access.isOwner,
    actorHighest: access.highest,
    canManageRoles: access.can(Perm.MANAGE_ROLES)
  })
}

/**
 * "Cargos ›" no menu de si mesmo: só o dono dá e tira cargos de si (qualquer
 * cargo, acima de tudo na hierarquia).
 */
export function computeSelfGivableRoles(
  inServer: boolean,
  roles: Role[],
  access: { isOwner: boolean; highest: number; can: (perm: number) => boolean }
): Role[] {
  return computeGivableRoles(inServer && access.isOwner, roles, access)
}

export function computeServerModerationPerms(
  canAct: boolean,
  canDisconnect: boolean,
  inFrom: (perm: number) => boolean,
  can: (perm: number) => boolean
): {
  canMute: boolean
  canDeafen: boolean
  canDisconnect: boolean
  canKick: boolean
  canBan: boolean
} {
  return {
    canMute: Boolean(canAct && inFrom(Perm.MUTE_MEMBERS)),
    canDeafen: Boolean(canAct && inFrom(Perm.DEAFEN_MEMBERS)),
    canDisconnect: Boolean(canDisconnect && inFrom(Perm.DISCONNECT_MEMBERS)),
    canKick: Boolean(canAct && can(Perm.KICK_MEMBERS)),
    canBan: Boolean(canAct && can(Perm.BAN_MEMBERS))
  }
}
