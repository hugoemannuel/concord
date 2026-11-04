import { useState } from 'react'
import Button from '../../../shared/ui/Button'
import Modal from '../../../shared/ui/Modal'
import type { ArchivableStatus } from '../api/archive'
import { archiveAllMessage, archiveCountLabel } from '../lib/archive'
import { archiveAllWithToast } from '../store/archiveActions'

/** Confirmação do "Arquivar concluídas/recusadas": arquivar tira do quadro de todo mundo. */
function ArchiveAllModal({
  status,
  count,
  onClose
}: {
  status: ArchivableStatus
  count: number
  onClose: () => void
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const confirm = async (): Promise<void> => {
    setBusy(true)
    await archiveAllWithToast(status)
    onClose()
  }
  return (
    <Modal open title={`${archiveCountLabel(status, count)}?`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-ds-sm text-secondary">{archiveAllMessage(status, count)}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button autoFocus loading={busy} onClick={() => void confirm()}>
            {archiveCountLabel(status, count)}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default ArchiveAllModal
