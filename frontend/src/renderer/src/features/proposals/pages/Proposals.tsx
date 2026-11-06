import { useEffect, useMemo, useState } from 'react'
import ProposalBoardDnd from '../components/ProposalBoardDnd'
import ProposalBoardModals from '../components/ProposalBoardModals'
import ProposalsHeader from '../components/ProposalsHeader'
import NewProposalModal from '../components/NewProposalModal'
import { useProposalBoard } from '../hooks/useProposalBoard'
import { useProposalDrag } from '../hooks/useProposalDrag'
import { useProposalSelection } from '../hooks/useProposalSelection'
import { BOARD_COLUMNS, REJECTED_COLUMN } from '../lib/proposals'
import { useAuthStore } from '../../auth/store/authStore'
import { useProposalStore } from '../store/proposalStore'
import { useNow } from '../../../shared/hooks/useNow'
import { ProposalBoardSkeleton } from '../../../shared/ui/skeleton/layouts'

// Atualiza a contagem regressiva dos cards.
const CLOCK_MS = 30_000

function Proposals(): React.JSX.Element {
  const proposals = useProposalStore((s) => s.proposals)
  const isTech = useProposalStore((s) => s.isTech)
  const loading = useProposalStore((s) => s.loading)
  const fetchProposals = useProposalStore((s) => s.fetchProposals)
  const markSeen = useProposalStore((s) => s.markSeen)
  const meId = useAuthStore((s) => s.user?.id ?? null)

  const now = useNow(CLOCK_MS)
  const [creating, setCreating] = useState(false)
  const [showRejected, setShowRejected] = useState(false)
  const selection = useProposalSelection(proposals, loading)
  const board = useProposalBoard(meId)
  const drag = useProposalDrag(proposals, board.requestMove)

  useEffect(() => {
    fetchProposals()
  }, [fetchProposals])

  // Abrir o quadro zera o badge; sair marca de novo o que chegou enquanto estava aqui.
  useEffect(() => {
    markSeen()
    return () => markSeen()
  }, [markSeen])

  const columns = showRejected ? [...BOARD_COLUMNS, REJECTED_COLUMN] : BOARD_COLUMNS
  const rejectedCount = useMemo(
    () => proposals.filter((p) => p.status === 'rejected').length,
    [proposals]
  )

  return (
    <div className="flex h-full w-full overflow-hidden bg-primary backdrop-blur-2xl text-gray-100">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ProposalsHeader
          isTech={isTech}
          showRejected={showRejected}
          rejectedCount={rejectedCount}
          onToggleRejected={() => setShowRejected((v) => !v)}
          onCreate={() => setCreating(true)}
        />

        {loading ? (
          <ProposalBoardSkeleton columns={columns} />
        ) : (
          <ProposalBoardDnd
            proposals={proposals}
            columns={columns}
            showRejected={showRejected}
            drag={drag}
            now={now}
            meId={meId}
            isTech={isTech}
            busyId={board.busyId}
            actions={board.actions}
            onOpen={selection.open}
          />
        )}
      </div>

      <NewProposalModal open={creating} onClose={() => setCreating(false)} />
      <ProposalBoardModals
        board={board}
        selected={selection.selected}
        onCloseSelected={selection.close}
        now={now}
        meId={meId}
        isTech={isTech}
      />
    </div>
  )
}

export default Proposals
