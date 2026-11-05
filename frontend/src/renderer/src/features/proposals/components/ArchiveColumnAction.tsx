import { useState } from 'react'
import Button from '../../../shared/ui/Button'
import { ArchiveIcon } from '../../../shared/ui/icons'
import type { ArchivableStatus } from '../api/archive'
import type { ProposalStatus } from '../api/proposals'
import { archiveCountLabel } from '../lib/archive'
import { useProposalStore } from '../store/proposalStore'
import ArchiveAllModal from './ArchiveAllModal'

const isArchivable = (status: ProposalStatus): status is ArchivableStatus =>
  status === 'done' || status === 'rejected'

/** "Arquivar concluídas" no alto da coluna (só o time tech; e só com cards). */
function ArchiveColumnAction({
  status,
  count
}: {
  status: ProposalStatus
  count: number
}): React.JSX.Element | null {
  const isTech = useProposalStore((s) => s.isTech)
  const [confirming, setConfirming] = useState(false)
  if (!isTech || count === 0 || !isArchivable(status)) return null
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={ArchiveIcon}
        className="mt-2 w-full"
        onClick={() => setConfirming(true)}
      >
        {archiveCountLabel(status, count)}
      </Button>
      {confirming && (
        <ArchiveAllModal status={status} count={count} onClose={() => setConfirming(false)} />
      )}
    </>
  )
}

export default ArchiveColumnAction
