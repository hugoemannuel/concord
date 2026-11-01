import { useState } from 'react'
import Button from '../../../shared/ui/Button'
import Modal from '../../../shared/ui/Modal'
import { showToast } from '../../../shared/store/toastStore'
import { transferOwnership } from '../api/ownership'
import { transferErrorMessage } from '../lib/ownershipTransfer'

interface Props {
  serverId: string
  serverName: string
  memberId: string
  memberName: string
  onClose: () => void
}

/** Confirma a transferência: depois dela, só o novo dono pode devolver. */
export default function TransferOwnershipModal(props: Props): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async (): Promise<void> => {
    setBusy(true)
    try {
      await transferOwnership(props.serverId, props.memberId)
      showToast.success(`${props.memberName} agora é dono de ${props.serverName}.`)
      props.onClose()
    } catch (err) {
      setError(transferErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title="Transferir posse" onClose={busy ? undefined : props.onClose}>
      <div className="flex flex-col gap-4">
        <p className="break-words text-ds-sm text-secondary">
          Passar <strong className="text-strong">{props.serverName}</strong> para{' '}
          <strong className="text-strong">{props.memberName}</strong>? Você deixa de ser dono e
          só a nova pessoa dona pode devolver.
        </p>
        {error && (
          <p role="alert" className="text-ds-xs text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={props.onClose} disabled={busy} className="min-h-10">
            Cancelar
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void confirm()} className="min-h-10">
            Transferir
          </Button>
        </div>
      </div>
    </Modal>
  )
}
