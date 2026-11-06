import { useNow } from '../../../shared/hooks/useNow'
import Button from '../../../shared/ui/Button'
import { GUEST_COPY } from '../lib/guestCopy'
import { timeLeftLabel } from '../lib/guestTime'
import type { GuestInviteSummary } from '../api/guestInvites'
import type { GuestInvitesState } from '../hooks/useGuestInvites'

function InviteRow({
  invite,
  now,
  state
}: {
  invite: GuestInviteSummary
  now: number
  state: GuestInvitesState
}): React.JSX.Element {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ds-sm font-medium text-strong">
          {GUEST_COPY.expiresIn(timeLeftLabel(invite.expires_at, now))}
        </span>
        <Button
          variant="danger"
          className="min-h-10"
          title={GUEST_COPY.revokeHint}
          onClick={() => void state.revoke(invite.id)}
        >
          {GUEST_COPY.revoke}
        </Button>
      </div>
      {invite.guests.length === 0 ? (
        <p className="text-ds-sm text-muted">{GUEST_COPY.nobodyYet}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {invite.guests.map((g) => (
            <li key={g.user_id} className="flex min-h-10 items-center justify-between gap-2">
              <span className="min-w-0 truncate text-ds-sm text-normal">{g.display_name}</span>
              {g.ended_at ? (
                <span className="text-ds-xs text-faint">{GUEST_COPY.removed}</span>
              ) : (
                <Button
                  variant="secondary"
                  className="min-h-10"
                  onClick={() => void state.remove(invite.server_id, g.user_id)}
                >
                  {GUEST_COPY.remove}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** Os links ativos do canal, com quem entrou por cada um. */
function GuestInviteList({ state }: { state: GuestInvitesState }): React.JSX.Element {
  const now = useNow()
  return (
    <section aria-label={GUEST_COPY.activeTitle} className="flex flex-col gap-2">
      <h3 className="text-ds-sm font-semibold text-secondary">{GUEST_COPY.activeTitle}</h3>
      {state.invites.length === 0 ? (
        <p className="text-ds-sm text-muted">{GUEST_COPY.noActive}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {state.invites.map((inv) => (
            <InviteRow key={inv.id} invite={inv} now={now} state={state} />
          ))}
        </ul>
      )}
    </section>
  )
}

export default GuestInviteList
