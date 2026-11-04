import { useState } from 'react'
import type { Proposal, ProposalStatus } from '../api/proposals'
import { canDeleteProposal, canEditProposal, canVote, closeLabel } from '../lib/proposals'
import MediaLightbox from '../../chat/components/MediaLightbox'
import Modal from '../../../shared/ui/Modal'
import AssigneeBadge from './AssigneeBadge'
import NewProposalModal from './NewProposalModal'
import {
  DetailActions,
  DetailByline,
  DetailImages,
  DetailVoteButtons,
  DetailVotes
} from './ProposalDetailParts'
import ProposalComments from './ProposalComments'

interface ProposalDetailModalProps {
  proposal: Proposal
  now: number
  meId: string | null
  isTech: boolean
  busy: boolean
  onVote: (approve: boolean) => void
  onRemoveVote: () => void
  onMove: (status: ProposalStatus) => void
  onDelete: () => void
  onClose: () => void
}

/** Versão expandida do card: texto inteiro, imagens, votação, ações e comentários. */
function ProposalDetailModal({
  proposal: p,
  now,
  meId,
  isTech,
  busy,
  onVote,
  onRemoveVote,
  onMove,
  onDelete,
  onClose
}: ProposalDetailModalProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [zoomed, setZoomed] = useState<string | null>(null)
  const open = canVote(p, now)
  const canEdit = canEditProposal(p, meId, isTech, now)
  const canDelete = canDeleteProposal(p, meId, isTech)

  return (
    <>
      <Modal open title={p.title} onClose={onClose} xl>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <DetailByline proposal={p} now={now} />

            {p.description && (
              <p className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-gray-200">
                {p.description}
              </p>
            )}

            <DetailImages images={p.images} onZoom={setZoomed} />

            {closeLabel(p) && <p className="text-xs text-gray-400">{closeLabel(p)}</p>}

            <DetailVotes proposal={p} />

            {p.assignee && p.status !== 'voting' && (
              <div className="flex">
                <AssigneeBadge assignee={p.assignee} meId={meId} />
              </div>
            )}

            {open && (
              <DetailVoteButtons
                myVote={p.my_vote}
                busy={busy}
                onVote={onVote}
                onRemoveVote={onRemoveVote}
              />
            )}

            <DetailActions
              proposal={p}
              isTech={isTech}
              canEdit={canEdit}
              canDelete={canDelete}
              busy={busy}
              onMove={onMove}
              onEdit={() => setEditing(true)}
              onDelete={onDelete}
            />
          </div>

          <aside className="min-w-0 rounded-xl border border-subtle bg-fg/3 p-4 lg:max-h-[68vh] lg:overflow-y-auto">
            <ProposalComments proposalId={p.id} meId={meId} isTech={isTech} />
          </aside>
        </div>
      </Modal>

      <NewProposalModal open={editing} proposal={p} onClose={() => setEditing(false)} />
      {zoomed && (
        <MediaLightbox src={zoomed} alt="Imagem da proposta" onClose={() => setZoomed(null)} />
      )}
    </>
  )
}

export default ProposalDetailModal
