import { INVITE_COPY } from '../lib/callInviteCopy'
import { emptyListText } from '../lib/inviteFriendsList'
import type { InviteSectionData } from '../hooks/useInviteCandidates'
import InviteSection from './InviteSection'

/** Lista rolável em seções (amigos, membros do servidor), cada linha com checkbox. */
function FriendPickList({
  loaded,
  sections,
  total,
  available,
  selected,
  disabled,
  onChange
}: {
  loaded: boolean
  sections: InviteSectionData[]
  total: number
  available: number
  selected: string[]
  disabled: boolean
  onChange: (next: string[]) => void
}): React.JSX.Element {
  const filled = sections.filter((s) => s.people.length > 0)
  let body: React.JSX.Element
  if (!loaded) {
    body = (
      <p role="status" className="p-3 text-ds-sm text-muted">
        {INVITE_COPY.loadingFriends}
      </p>
    )
  } else if (filled.length === 0) {
    body = <p className="p-3 text-ds-sm text-muted">{emptyListText(total, available)}</p>
  } else {
    body = (
      <div className="flex flex-col gap-3">
        {filled.map((s) => (
          <InviteSection
            key={s.key}
            section={s}
            selected={selected}
            disabled={disabled}
            onChange={onChange}
          />
        ))}
      </div>
    )
  }
  return <div className="max-h-[50vh] min-h-24 overflow-y-auto overscroll-contain">{body}</div>
}

export default FriendPickList
