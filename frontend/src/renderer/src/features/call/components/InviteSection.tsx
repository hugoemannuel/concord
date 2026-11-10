import Button from '../../../shared/ui/Button'
import { INVITE_COPY } from '../lib/callInviteCopy'
import { toggleSelected } from '../lib/inviteFriendsList'
import { toggleAll } from '../lib/invitePeople'
import type { InviteSectionData } from '../hooks/useInviteCandidates'
import InviteFriendRow from './InviteFriendRow'

/** Uma seção da lista (amigos ou membros): título, "Selecionar todos" e as linhas. */
function InviteSection({
  section,
  selected,
  disabled,
  onChange
}: {
  section: InviteSectionData
  selected: string[]
  disabled: boolean
  onChange: (next: string[]) => void
}): React.JSX.Element {
  const ids = section.people.map((p) => p.id)
  const allSelected = ids.every((id) => selected.includes(id))
  const headingId = `invite-section-${section.key}`
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-0.5">
      <div className="flex min-h-10 items-center justify-between gap-2 px-2">
        <h3 id={headingId} className="truncate text-ds-xs font-semibold uppercase text-muted">
          {section.title} — {ids.length}
        </h3>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0 pointer-coarse:min-h-10"
          disabled={disabled}
          aria-label={
            allSelected
              ? INVITE_COPY.unselectAllLabel(section.title)
              : INVITE_COPY.selectAllLabel(section.title)
          }
          onClick={() => onChange(toggleAll(selected, ids))}
        >
          {allSelected ? INVITE_COPY.unselectAll : INVITE_COPY.selectAll}
        </Button>
      </div>
      <ul className="flex flex-col gap-0.5">
        {section.people.map((p) => (
          <InviteFriendRow
            key={p.id}
            friend={p}
            selected={selected.includes(p.id)}
            disabled={disabled}
            onToggle={() => onChange(toggleSelected(selected, p.id))}
          />
        ))}
      </ul>
    </section>
  )
}

export default InviteSection
