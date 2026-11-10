import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  StreamContextMenu,
  MaestroContextMenu,
  SelfUserMenu,
  StandardUserDMSection,
  StandardUserServerSection,
  UserVolumeSection,
  MENU_WIDTH
} from './UserContextMenuSections'
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
  getAudioKey,
  canChangeServerNickname
} from '../lib/userMenuActions'
import router from '../../../app/router'
import { useAuthStore } from '../../auth/store/authStore'
import { useCallStore } from '../../call/store/callStore'
import { useFriendStore, useRelationship } from '../../friends/store/friendStore'
import { useServerStore } from '../../servers/store/serverStore'
import { useServerAccess } from '../../servers/hooks/useServerAccess'
import { useModerationStore } from '../../call/store/moderationStore'
import { useUserAudioStore } from '../../call/store/userAudioStore'
import { useUserMenuStore, type UserMenuTarget } from '../store/userMenuStore'
import { isMaestroUser } from '../../music/lib/music'
import { UserMemberSubmenus } from './UserContextMenuSubmenus'
import SelfRolesSubmenu from './SelfRolesSubmenu'
import { useStandardUserMenuActions } from '../hooks/useStandardUserMenuActions'
import { useStandardUserMenuModel } from '../hooks/useStandardUserMenuModel'
import CastigoMenuItems from '../../castigo/components/CastigoMenuItems'

const itemClass = 'cursor-pointer rounded px-2 py-1.5 text-left hover:bg-fg/5 disabled:opacity-50'

interface StandardUserMenuProps {
  target: UserMenuTarget
  audioKey: string
  audio: { volume: number; muted: boolean }
  meId?: string
  left: number
  top: number
  menuRef: React.RefObject<HTMLDivElement | null>
  close: () => void
}

function StandardUserMenu({
  target,
  audioKey,
  audio,
  meId,
  left,
  top,
  menuRef,
  close
}: StandardUserMenuProps): React.JSX.Element {
  const setVolume = useUserAudioStore((s) => s.setVolume)
  const toggleMuted = useUserAudioStore((s) => s.toggleMuted)
  const relationship = useRelationship(target.userId)
  const sendRequest = useFriendStore((s) => s.sendRequest)
  const accept = useFriendStore((s) => s.accept)
  const unblock = useFriendStore((s) => s.unblock)
  const callIdle = useCallStore((s) => s.status === 'idle')
  const startDMCall = useCallStore((s) => s.startDMCall)
  const {
    server,
    member,
    username,
    inCallWith,
    givable,
    voiceState,
    voiceCallId,
    moveTargets,
    canNick,
    modPerms
  } = useStandardUserMenuModel(target, meId)
  const { saving, moveTo, moderate, toggleRole } = useStandardUserMenuActions(
    target,
    server?.id,
    close
  )

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Opções de ${target.name}`}
      style={{ left, top, width: MENU_WIDTH }}
      data-user-context-menu="true"
      className="fixed z-[80] flex max-h-[calc(100vh-16px)] flex-col gap-1 overflow-y-auto rounded-lg border border-subtle bg-floating p-2 text-ds-sm text-normal shadow-2xl"
    >
      <p className="truncate px-2 pb-1 pt-0.5 text-ds-xs font-bold text-muted">{target.name}</p>

      <StandardUserDMSection
        target={target}
        username={username}
        relationship={relationship}
        callIdle={callIdle}
        itemClass={itemClass}
        onOpenProfile={() => {
          close()
          openUserProfile({ ...target, username })
        }}
        onSendMessage={() => {
          close()
          sendDirectMessage(target.userId)
        }}
        onCloseDm={() => {
          close()
          void closeDirectMessage(
            target.conversationId!,
            target.userId,
            router.state.location.pathname
          )
        }}
        onCall={() => {
          close()
          void startUserCall(target.userId, username ?? '', target.name, startDMCall)
        }}
        onAddFriend={() => {
          close()
          if (username) void sendUserFriendRequest(username, target.name, sendRequest)
        }}
        onAcceptRequest={() => {
          close()
          if (username) void acceptUserFriendRequest(username, accept)
        }}
        onAskRemove={() => {
          close()
          if (username) confirmUserRemoveFriend(target.userId, username, target.name)
        }}
        onAskBlock={() => {
          close()
          confirmUserBlock(target.userId, username ?? '', target.name)
        }}
        onDoUnblock={() => {
          close()
          unblockUserTarget(target.userId, unblock)
        }}
      />

      {inCallWith && (
        <>
          <div className="my-1 h-px bg-fg/10" />
          <UserVolumeSection
            label="Volume do usuário"
            muteLabel="Silenciar"
            volume={audio.volume}
            muted={audio.muted}
            onVolumeChange={(v) => setVolume(audioKey, v)}
            onToggleMute={() => toggleMuted(audioKey)}
          />
        </>
      )}

      <UserMemberSubmenus
        givable={givable}
        memberRoleIds={member?.role_ids}
        moveTargets={moveTargets}
        saving={saving}
        itemClass={itemClass}
        onToggleRole={(roleId, has) => void toggleRole(roleId, has)}
        onMoveTo={(id, name) => void moveTo(id, name)}
      />

      <StandardUserServerSection
        server={server}
        canNick={canNick}
        voiceCallId={voiceCallId}
        voiceState={voiceState}
        canMuteInVoice={modPerms.canMute}
        canDeafenInVoice={modPerms.canDeafen}
        canDisconnect={modPerms.canDisconnect}
        canKick={modPerms.canKick}
        canBan={modPerms.canBan}
        target={target}
        saving={saving}
        close={close}
        itemClass={itemClass}
        onEditNickname={() => {
          if (server && member) {
            close()
            promptEditNickname({
              serverId: server.id,
              userId: target.userId,
              name: target.name,
              nickname: member.nickname,
              displayName: member.display_name,
              self: false,
              askNickname: useModerationStore.getState().askNickname
            })
          }
        }}
        onModerate={moderate}
      />

      <CastigoMenuItems
        target={{ userId: target.userId, name: target.name, voiceCallId }}
        itemClass={itemClass}
        close={close}
      />
    </div>
  )
}

/**
 * Menu de contexto de usuário. Exibe as opções específicas para streams,
 * robô Maestro, o próprio usuário autenticado ou membros do servidor / contatos.
 */
function UserContextMenu(): React.JSX.Element | null {
  const target = useUserMenuStore((s) => s.target)
  const close = useUserMenuStore((s) => s.close)
  const meId = useAuthStore((s) => s.user?.id)
  const audioKey = getAudioKey(target)
  const audio = useUserAudioStore((s) => (target ? s.get(audioKey) : null))
  const setVolume = useUserAudioStore((s) => s.setVolume)
  const toggleMuted = useUserAudioStore((s) => s.toggleMuted)
  const server = useServerStore((s) => s.currentServer)
  const member = useServerStore((s) => s.currentMembers.find((m) => m.user_id === target?.userId))
  const access = useServerAccess()
  const ref = useRef<HTMLDivElement | null>(null)
  const [menuHeight, setMenuHeight] = useState<number>(420)

  useLayoutEffect(() => {
    if (ref.current) setMenuHeight(ref.current.offsetHeight)
  }, [target])

  useEffect(() => {
    if (!target) return
    const onDown = (e: MouseEvent): void => {
      const node = e.target as Node
      if (ref.current?.contains(node) || target.anchorEl?.contains(node)) return
      close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [target, close])

  if (!target || !audio) return null

  const left = Math.max(8, Math.min(target.x, window.innerWidth - MENU_WIDTH - 8))
  const top = Math.max(8, Math.min(target.y, window.innerHeight - (menuHeight || 420) - 8))

  const renderVolume = (label: string, muteLabel: string): React.JSX.Element => (
    <UserVolumeSection
      label={label}
      muteLabel={muteLabel}
      volume={audio.volume}
      muted={audio.muted}
      onVolumeChange={(v) => setVolume(audioKey, v)}
      onToggleMute={() => toggleMuted(audioKey)}
    />
  )

  if (target.stream) {
    return (
      <StreamContextMenu
        target={target}
        left={left}
        top={top}
        menuRef={ref}
        renderVolumeControls={renderVolume}
      />
    )
  }

  if (isMaestroUser(target.userId)) {
    return (
      <MaestroContextMenu
        target={target}
        left={left}
        top={top}
        server={server}
        meId={meId}
        itemClass={itemClass}
        menuRef={ref}
        close={close}
        renderVolumeControls={renderVolume}
      />
    )
  }

  if (target.userId === meId) {
    const canSelfNick = canChangeServerNickname(
      Boolean(server && member),
      router.state.location.pathname,
      server?.id,
      access.canChangeNickname(target.userId)
    )

    return (
      <SelfUserMenu
        target={target}
        server={server}
        member={member}
        canNick={canSelfNick}
        left={left}
        top={top}
        menuRef={ref}
        close={close}
        onEditNickname={() => {
          if (server && member) {
            close()
            promptEditNickname({
              serverId: server.id,
              userId: target.userId,
              name: target.name,
              nickname: member.nickname,
              displayName: member.display_name,
              self: true,
              askNickname: useModerationStore.getState().askNickname
            })
          }
        }}
        onOpenProfile={() => {
          close()
          openUserProfile({ ...target, username: member?.username })
        }}
        itemClass={itemClass}
        rolesItem={<SelfRolesSubmenu target={target} itemClass={itemClass} close={close} />}
      />
    )
  }

  return (
    <StandardUserMenu
      target={target}
      audioKey={audioKey}
      audio={audio}
      meId={meId}
      left={left}
      top={top}
      menuRef={ref}
      close={close}
    />
  )
}

export default UserContextMenu
