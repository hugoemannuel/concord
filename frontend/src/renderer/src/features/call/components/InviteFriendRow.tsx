import Avatar from '../../../shared/ui/Avatar'
import { CheckIcon } from '../../../shared/ui/icons'
import { usePresenceStatus } from '../../chat/store/chatStore'
import { INVITE_COPY } from '../lib/callInviteCopy'
import type { InvitableFriend } from '../lib/inviteFriendsList'

/** Linha de amigo na lista de convite: o alvo inteiro (≥ 44 px) marca/desmarca. */
function InviteFriendRow({
  friend,
  selected,
  disabled,
  onToggle
}: {
  friend: InvitableFriend
  selected: boolean
  disabled: boolean
  onToggle: () => void
}): React.JSX.Element {
  const status = usePresenceStatus(friend.id)
  const name = friend.display_name || friend.username
  return (
    <li>
      <label
        className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors focus-within:outline-2 focus-within:outline-brand hover:bg-fg/5 ${
          selected ? 'bg-fg/10' : ''
        }`}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
        />
        <Avatar
          userId={friend.id}
          name={name}
          avatarUrl={friend.avatar_url}
          decorationUrl={friend.avatar_decoration_url}
          size={36}
          status={status}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-ds-sm font-medium text-strong">{name}</span>
          <span className="block truncate text-ds-xs text-muted">
            {status === 'offline' ? INVITE_COPY.offline : INVITE_COPY.online}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
            selected ? 'border-brand bg-brand text-white' : 'border-normal bg-transparent'
          }`}
        >
          {selected && <CheckIcon className="h-4 w-4" />}
        </span>
      </label>
    </li>
  )
}

export default InviteFriendRow
