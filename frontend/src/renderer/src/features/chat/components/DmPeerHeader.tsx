import Avatar from '../../../shared/ui/Avatar'
import { STATUS_META, type PresenceStatus } from '../../friends/lib/presenceStatus'
import StyledName from '../../profile/components/StyledName'
import { profileCardHandler } from '../../profile/store/profileCardStore'
import type { PeerLike } from '../lib/dmPeer'

interface HeaderProps {
  userId: string | undefined
  other: PeerLike | undefined
  /** Nome como a pessoa configurou (perfil ao vivo). */
  name: string
  avatarName: string
  handle: string
  status: PresenceStatus
}

/** Lado esquerdo do cabeçalho da DM: avatar, nome, @ e status da outra pessoa. */
function DmPeerHeader({
  userId,
  other,
  name,
  avatarName,
  handle,
  status
}: HeaderProps): React.JSX.Element {
  return (
    <>
      <div className="flex items-center gap-2.5 min-w-0">
        <PeerAvatarButton
          userId={userId}
          other={other}
          name={name}
          avatarName={avatarName}
          handle={handle}
          status={status}
        />
        <div className="min-w-0">
          <p className="truncate text-ds-md font-semibold text-strong">
            <StyledName name={name} userId={userId} style={other?.name_style} />
          </p>
          {handle && <p className="truncate text-ds-xs text-muted">@{handle}</p>}
        </div>
      </div>
      <span className="shrink-0 text-ds-xs font-semibold max-sm:hidden" style={{ color: STATUS_META[status].textColor }}>
        {STATUS_META[status].label}
      </span>
    </>
  )
}

function PeerAvatarButton({
  userId,
  other,
  name,
  avatarName,
  handle,
  status
}: HeaderProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={userId ? profileCardHandler(userId, name, handle || undefined, 'right') : undefined}
      aria-label={`Perfil de ${name}`}
      className="cursor-pointer rounded-full"
    >
      <Avatar
        userId={userId}
        name={avatarName}
        avatarUrl={other?.avatar_url}
        decorationUrl={other?.avatar_decoration_url}
        size={32}
        animate="always"
        status={status}
        cutoutColor="var(--bg-primary)"
      />
    </button>
  )
}

export default DmPeerHeader
