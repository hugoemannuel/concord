import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../app/router', () => ({
  default: {
    navigate: vi.fn(),
    state: { location: { pathname: '/servers/s1/c1' } }
  }
}))

vi.mock('../../../shared/store/toastStore', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../store/profileCardStore', () => ({
  useProfileCardStore: {
    getState: vi.fn(() => ({
      open: vi.fn()
    }))
  }
}))

vi.mock('../../chat/api/conversations', () => ({
  hideConversation: vi.fn(),
  getOrCreateConversationWith: vi.fn()
}))

vi.mock('../../chat/store/chatStore', () => ({
  useChatStore: {
    setState: vi.fn(),
    getState: vi.fn(() => ({ conversations: [] }))
  }
}))

vi.mock('../../friends/store/friendActionsStore', () => ({
  confirmBlock: vi.fn(),
  confirmRemoveFriend: vi.fn()
}))

import {
  openUserProfile,
  sendDirectMessage,
  closeDirectMessage,
  startUserCall,
  sendUserFriendRequest,
  acceptUserFriendRequest,
  confirmUserRemoveFriend,
  confirmUserBlock,
  unblockUserTarget,
  promptEditNickname,
  computeVoiceMoveTargets,
  getAudioKey,
  canChangeServerNickname,
  resolveTargetUsername,
  computeGivableRoles,
  computeSelfGivableRoles,
  computeServerModerationPerms
} from './userMenuActions'
import router from '../../../app/router'
import { showToast } from '../../../shared/store/toastStore'
import { useProfileCardStore } from '../store/profileCardStore'
import { hideConversation, getOrCreateConversationWith } from '../../chat/api/conversations'
import { confirmBlock, confirmRemoveFriend } from '../../friends/store/friendActionsStore'
import { Perm, type Role } from '../../servers/lib/permissions'

describe('userMenuActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('openUserProfile opens profile card with right side and anchor', () => {
    const openMock = vi.fn()
    vi.mocked(useProfileCardStore.getState).mockReturnValue({ open: openMock } as never)
    openUserProfile({ userId: 'u1', name: 'User 1', username: 'user1', x: 100, y: 200 })
    expect(openMock).toHaveBeenCalledWith({
      userId: 'u1',
      name: 'User 1',
      username: 'user1',
      side: 'right',
      anchor: { top: 200, left: 100, right: 100, bottom: 200 }
    })
  })

  it('sendDirectMessage navigates to dm path', () => {
    sendDirectMessage('u1')
    expect(router.navigate).toHaveBeenCalledWith('/dm/u1')
  })

  it('closeDirectMessage hides conversation and navigates if currently on that DM', async () => {
    vi.mocked(hideConversation).mockResolvedValue(undefined as never)
    await closeDirectMessage('c1', 'u1', '/dm/u1')
    expect(hideConversation).toHaveBeenCalledWith('c1')
    expect(router.navigate).toHaveBeenCalledWith('/friends')
  })

  it('startUserCall gets conv and starts call', async () => {
    vi.mocked(getOrCreateConversationWith).mockResolvedValue({ id: 'c1' } as never)
    const startDMCall = vi.fn()

    await startUserCall('u1', 'user1', 'User One', startDMCall)
    expect(getOrCreateConversationWith).toHaveBeenCalledWith('u1')
    expect(router.navigate).toHaveBeenCalledWith('/dm/u1')
    expect(startDMCall).toHaveBeenCalledWith('c1', {
      id: 'u1',
      username: 'user1',
      display_name: 'User One'
    })
  })

  it('sendUserFriendRequest notifies on success', async () => {
    const sendReq = vi.fn().mockResolvedValue('accepted')
    await sendUserFriendRequest('user1', 'User One', sendReq)
    expect(sendReq).toHaveBeenCalledWith('user1')
    expect(showToast.success).toHaveBeenCalledWith('Você e User One agora são amigos.')
  })

  it('acceptUserFriendRequest calls accept', async () => {
    const accept = vi.fn().mockResolvedValue(undefined)
    await acceptUserFriendRequest('user1', accept)
    expect(accept).toHaveBeenCalledWith('user1')
  })

  it('confirmUserRemoveFriend and confirmUserBlock call friendActionsStore', () => {
    confirmUserRemoveFriend('u1', 'user1', 'User One')
    expect(confirmRemoveFriend).toHaveBeenCalledWith({
      userId: 'u1',
      username: 'user1',
      name: 'User One'
    })

    confirmUserBlock('u1', 'user1', 'User One')
    expect(confirmBlock).toHaveBeenCalledWith({
      userId: 'u1',
      username: 'user1',
      name: 'User One'
    })
  })

  it('unblockUserTarget calls unblock and handles errors', async () => {
    const unblock = vi.fn().mockResolvedValue(undefined)
    unblockUserTarget('u1', unblock)
    expect(unblock).toHaveBeenCalledWith('u1')

    const failing = vi.fn().mockRejectedValue(new Error('Falhou'))
    unblockUserTarget('u1', failing)
    await Promise.resolve()
    expect(showToast.error).toHaveBeenCalledWith('Falhou')
  })

  it('promptEditNickname passes payload to askNickname', () => {
    const askNickname = vi.fn()
    promptEditNickname({
      serverId: 's1',
      userId: 'u1',
      name: 'User One',
      nickname: 'Nick',
      displayName: 'Display',
      self: false,
      askNickname
    })
    expect(askNickname).toHaveBeenCalledWith({
      serverId: 's1',
      userId: 'u1',
      name: 'User One',
      nickname: 'Nick',
      displayName: 'Display',
      self: false
    })
  })

  it('computeVoiceMoveTargets filters other voice channels only when canMove is true', () => {
    const channels = [
      { id: 'v1', name: 'Voz 1', type: 'voice' },
      { id: 'v2', name: 'Voz 2', type: 'voice' },
      { id: 't1', name: 'Texto', type: 'text' }
    ]
    expect(computeVoiceMoveTargets('v1', channels, true)).toEqual([{ id: 'v2', name: 'Voz 2', type: 'voice' }])
    expect(computeVoiceMoveTargets('v1', channels, false)).toEqual([])
    expect(computeVoiceMoveTargets(null, channels, true)).toEqual([])
  })

  it('getAudioKey returns empty, stream or raw userId', () => {
    expect(getAudioKey(null)).toBe('')
    expect(getAudioKey({ userId: 'u1' })).toBe('u1')
    expect(getAudioKey({ userId: 'u1', stream: true })).toBe('screen:u1')
  })

  it('canChangeServerNickname returns true only when in server and path matches', () => {
    expect(canChangeServerNickname(true, '/servers/s1/c1', 's1', true)).toBe(true)
    expect(canChangeServerNickname(false, '/servers/s1/c1', 's1', true)).toBe(false)
    expect(canChangeServerNickname(true, '/servers/s2/c1', 's1', true)).toBe(false)
    expect(canChangeServerNickname(true, '/servers/s1/c1', 's1', false)).toBe(false)
  })

  it('resolveTargetUsername returns first available username', () => {
    expect(resolveTargetUsername('u1', 'u2', 'u3')).toBe('u1')
    expect(resolveTargetUsername(undefined, 'u2', 'u3')).toBe('u2')
    expect(resolveTargetUsername(undefined, undefined, 'u3')).toBe('u3')
    expect(resolveTargetUsername()).toBeUndefined()
  })

  it('computeGivableRoles returns empty if not in server', () => {
    const roles: Role[] = [{ id: 'r1', server_id: 's1', name: 'Mod', position: 1, permissions: 0, color: null, hoist: false, is_default: false }]
    expect(computeGivableRoles(false, roles, { isOwner: true, highest: 10, can: () => true })).toEqual([])
    expect(computeGivableRoles(true, roles, { isOwner: true, highest: 10, can: () => true })).toHaveLength(1)
  })

  // Regressão da issue #331: o dono dá cargos a si mesmo pelo menu.
  it('computeSelfGivableRoles: só o dono tem "Cargos" no menu de si mesmo', () => {
    const roles: Role[] = [{ id: 'r1', server_id: 's1', name: 'Mod', position: 1, permissions: 0, color: null, hoist: false, is_default: false }]
    expect(computeSelfGivableRoles(true, roles, { isOwner: true, highest: 0, can: () => true })).toHaveLength(1)
    expect(computeSelfGivableRoles(true, roles, { isOwner: false, highest: 10, can: () => true })).toEqual([])
    expect(computeSelfGivableRoles(false, roles, { isOwner: true, highest: 0, can: () => true })).toEqual([])
  })

  it('computeServerModerationPerms usa canModerateVoice para voz e canAct para kick/ban', () => {
    const sameLevel = computeServerModerationPerms(
      false,
      true,
      (p) => p === Perm.MUTE_MEMBERS || p === Perm.DEAFEN_MEMBERS || p === Perm.DISCONNECT_MEMBERS,
      () => true
    )
    expect(sameLevel).toEqual({
      canMute: true,
      canDeafen: true,
      canDisconnect: true,
      canKick: false,
      canBan: false
    })

    const higherTarget = computeServerModerationPerms(
      false,
      false,
      () => true,
      () => true
    )
    expect(higherTarget).toEqual({
      canMute: false,
      canDeafen: false,
      canDisconnect: false,
      canKick: false,
      canBan: false
    })

    const lowerTarget = computeServerModerationPerms(
      true,
      true,
      () => false,
      (p) => p === Perm.KICK_MEMBERS
    )
    expect(lowerTarget).toEqual({
      canMute: false,
      canDeafen: false,
      canDisconnect: false,
      canKick: true,
      canBan: false
    })
  })
})
