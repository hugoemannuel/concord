import type { Proposal, ProposalStatus } from '../api/proposals'
import { canArchive } from '../lib/archive'
import { canDeleteProposal, canVote } from '../lib/proposals'
import AssigneeBadge from './AssigneeBadge'
import {
  cardInteraction,
  ProposalByline,
  ProposalCardActions,
  ProposalCover,
  ProposalIssueLink,
  ProposalVoteBar,
  ProposalVoteButtons
} from './ProposalCardParts'

interface ProposalCardProps {
  proposal: Proposal
  now: number
  meId: string | null
  isTech: boolean
  busy: boolean
  /** Abre a versão expandida (modal) do card. */
  onOpen: () => void
  onVote: (approve: boolean) => void
  onRemoveVote: () => void
  onMove: (status: ProposalStatus) => void
  onDelete: () => void
  /** Clone que segue o mouse no arrasto: sem botões e sem abrir o modal. */
  overlay?: boolean
}

function ProposalCard({
  proposal: p,
  now,
  meId,
  isTech,
  busy,
  onOpen,
  onVote,
  onRemoveVote,
  onMove,
  onDelete,
  overlay = false
}: ProposalCardProps): React.JSX.Element {
  const open = canVote(p, now) && !overlay
  const canDelete = canDeleteProposal(p, meId, isTech)

  return (
    <article
      {...cardInteraction(overlay, p.title, onOpen)}
      className={`flex flex-col gap-3 rounded-xl border p-3 focus-visible:outline-2 focus-visible:outline-brand ${
        overlay
          ? 'rotate-2 cursor-grabbing border-brand/60 bg-floating shadow-2xl shadow-black/60'
          : 'cursor-pointer border-subtle bg-fg/3 transition-colors hover:bg-fg/5'
      }`}
    >
      <ProposalCover images={p.images} />
      <div className="min-w-0">
        <h3 className="wrap-break-word text-ds-sm font-semibold leading-snug text-strong">
          {p.title}
        </h3>
        {p.description && (
          <p className="mt-1 line-clamp-4 whitespace-pre-wrap wrap-break-word text-ds-xs text-muted">
            {p.description}
          </p>
        )}
      </div>

      <ProposalByline proposal={p} now={now} />

      {p.assignee && p.status !== 'voting' && (
        <div className="flex">
          <AssigneeBadge assignee={p.assignee} meId={meId} />
        </div>
      )}

      <ProposalVoteBar proposal={p} />

      {open && (
        <ProposalVoteButtons
          myVote={p.my_vote}
          busy={busy}
          onVote={onVote}
          onRemoveVote={onRemoveVote}
        />
      )}

      {!overlay && (
        <>
          <ProposalIssueLink proposal={p} />
          <ProposalCardActions
            proposalId={p.id}
            status={p.status}
            isTech={isTech}
            canArchive={canArchive(p, isTech)}
            canDelete={canDelete}
            busy={busy}
            onMove={onMove}
            onDelete={onDelete}
          />
        </>
      )}
    </article>
  )
}

export default ProposalCard
