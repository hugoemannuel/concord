import type { Proposal } from '../api/proposals'
import type { ProposalBoard } from '../hooks/useProposalBoard'
import ConfirmCloseModal from './ConfirmCloseModal'
import ConfirmTakeoverModal from './ConfirmTakeoverModal'
import ProposalDetailModal from './ProposalDetailModal'

/** Os modais do quadro: o card aberto e as confirmações de mover. */
function ProposalBoardModals({
  board,
  selected,
  onCloseSelected,
  now,
  meId,
  isTech
}: {
  board: ProposalBoard
  selected: Proposal | null
  onCloseSelected: () => void
  now: number
  meId: string | null
  isTech: boolean
}): React.JSX.Element {
  const { closeConfirm, takeoverConfirm } = board
  return (
    <>
      {selected && (
        <ProposalDetailModal
          proposal={selected}
          now={now}
          meId={meId}
          isTech={isTech}
          busy={board.busyId === selected.id}
          onClose={onCloseSelected}
          {...board.actions(selected.id)}
        />
      )}
      {closeConfirm && (
        <ConfirmCloseModal
          proposal={closeConfirm.card}
          target={closeConfirm.status}
          onCancel={board.cancelClose}
          onConfirm={() => board.confirmClose({ id: closeConfirm.card.id, status: closeConfirm.status })}
        />
      )}
      {takeoverConfirm && (
        <ConfirmTakeoverModal
          proposal={takeoverConfirm.card}
          target={takeoverConfirm.status}
          onCancel={board.cancelTakeover}
          onConfirm={() =>
            board.confirmTakeover({ id: takeoverConfirm.card.id, status: takeoverConfirm.status })
          }
        />
      )}
    </>
  )
}

export default ProposalBoardModals
