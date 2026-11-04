import { useState } from 'react'
import Button from '../../../shared/ui/Button'
import { ArchiveIcon } from '../../../shared/ui/icons'
import { archiveWithUndo } from '../store/archiveActions'

/** "Arquivar" de um card concluído ou recusado (só o time tech vê). */
function ArchiveButton({ id, className = '' }: { id: string; className?: string }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const run = async (): Promise<void> => {
    setBusy(true)
    await archiveWithUndo(id)
    setBusy(false)
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={ArchiveIcon}
      className={className}
      loading={busy}
      onClick={() => void run()}
    >
      Arquivar
    </Button>
  )
}

export default ArchiveButton
