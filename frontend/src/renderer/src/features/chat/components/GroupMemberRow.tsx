import { useAuthStore } from '../../auth/store/authStore'
import { usePresenceStatus } from '../store/chatStore'
import { useUserLook } from '../../profile/store/profileStore'
import { profileCardHandler } from '../../profile/store/profileCardStore'
import { userMenuHandler } from '../../profile/store/userMenuStore'
import Avatar from '../../../shared/ui/Avatar'
import StyledName from '../../profile/components/StyledName'
import Nameplate from '../../profile/components/Nameplate'
import { useHoverActive } from '../../../shared/hooks/useHoverActive'
import { CrownIcon, XIcon } from '../../../shared/ui/icons'
import type { ConversationOtherUser } from '../api/conversations'

/** Um participante na lista do grupo; o dono pode removê-lo. */
function GroupMemberRow({
  member,
  isOwner,
  canRemove,
  onRemove
}: {
  member: ConversationOtherUser
  isOwner: boolean
  canRemove: boolean
  onRemove: () => void
}): React.JSX.Element {
  const meId = useAuthStore((s) => s.user?.id)
  const status = usePresenceStatus(member.id)
  const look = useUserLook(member.id, {
    name: member.display_name || member.username,
    avatarUrl: member.avatar_url,
    nameplateUrl: member.nameplate_url,
    decorationUrl: member.avatar_decoration_url
  })
  const hover = useHoverActive()
  return (
    <div
      {...hover.bind}
      role="button"
      tabIndex={0}
      onClick={profileCardHandler(member.id, look.name, member.username, 'left')}
      onContextMenu={userMenuHandler(member.id, look.name, meId, member.username)}
      className="group relative flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-fg/6"
    >
      <Nameplate url={look.nameplateUrl} active={hover.active} fade="var(--bg-secondary)" />
      <Avatar
        userId={member.id}
        name={look.name}
        avatarUrl={look.avatarUrl}
        decorationUrl={look.decorationUrl}
        active={hover.active}
        size={32}
        status={status}
        cutoutColor="var(--bg-secondary)"
      />
      <span
        className={`relative min-w-0 flex-1 truncate text-ds-md font-medium ${
          status === 'offline' ? 'text-faint' : 'text-normal'
        }`}
      >
        <StyledName name={look.name} userId={member.id} style={member.name_style} />
      </span>
      {isOwner && (
        <span title="Dono do grupo" className="relative shrink-0 text-warning">
          <CrownIcon size={16} />
        </span>
      )}
      {canRemove && (
        <button
          type="button"
          title="Remover do grupo"
          aria-label="Remover do grupo"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="relative cursor-pointer text-muted hover:text-danger [@media(hover:hover)]:sr-only [@media(hover:hover)]:group-hover:not-sr-only focus-visible:not-sr-only"
        >
          <XIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export default GroupMemberRow
