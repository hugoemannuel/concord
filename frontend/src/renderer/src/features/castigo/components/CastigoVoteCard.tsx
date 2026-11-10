import Button from '../../../shared/ui/Button'
import { ClockIcon } from '../../../shared/ui/icons'
import { useCastigoNames } from '../hooks/useCastigoNames'
import type { CastigoVoteState } from '../hooks/useCastigoVote'
import type { BallotState, CastigoVote } from '../lib/castigo'
import { CASTIGO_COPY, voteSummary } from '../lib/castigoCopy'

/** O que fica no lugar dos botões depois de votar (ou para quem não vota). */
function ballotNote(ballot: BallotState, isTarget: boolean): string {
  if (isTarget) return CASTIGO_COPY.isTarget
  return ballot === 'not_voter' ? CASTIGO_COPY.notVoter : CASTIGO_COPY.voted
}

function resultText(vote: CastigoVote, target: string): string {
  return vote.status === 'passed' ? CASTIGO_COPY.votePassed(target) : CASTIGO_COPY.voteFailed
}

/** A votação de castigo na call: quem, o quê, a contagem e o Sim/Não. */
function CastigoVoteCard({
  state
}: {
  state: CastigoVoteState & { vote: CastigoVote }
}): React.JSX.Element {
  const nameOf = useCastigoNames()
  const { vote, ballot, isTarget, busy, cast } = state
  const target = nameOf(vote.target_id)
  const open = vote.status === 'open'

  return (
    <div
      role="status"
      className="pointer-events-auto flex flex-col gap-2 rounded-lg border border-warning/30 bg-floating p-3 shadow-2xl"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
          <ClockIcon size={16} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-ds-sm font-semibold text-strong">
            {CASTIGO_COPY.voteTitle(target)}
          </p>
          <p className="text-ds-xs text-secondary">{voteSummary(vote)}</p>
          <p className="text-ds-xs text-muted">
            {open ? CASTIGO_COPY.voteBy(nameOf(vote.initiator_id)) : resultText(vote, target)}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-ds-xs font-medium text-secondary">
          {CASTIGO_COPY.voteCount(vote.yes.length, vote.needed)}
        </span>
        {open && ballot === 'can_vote' ? (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void cast(false)}>
              {CASTIGO_COPY.voteNo}
            </Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void cast(true)}>
              {CASTIGO_COPY.voteYes}
            </Button>
          </div>
        ) : (
          open && <span className="text-ds-xs text-muted">{ballotNote(ballot, isTarget)}</span>
        )}
      </div>
    </div>
  )
}

export default CastigoVoteCard
