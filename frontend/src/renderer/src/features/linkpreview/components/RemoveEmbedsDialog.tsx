import Button from '../../../shared/ui/Button'
import Modal from '../../../shared/ui/Modal'

/** Confirmação do X do cartão: as prévias somem da mensagem para todo mundo. */
export default function RemoveEmbedsDialog({
  open,
  busy,
  onCancel,
  onConfirm
}: {
  open: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}): React.JSX.Element | null {
  return (
    <Modal open={open} title="Remover prévias?" onClose={onCancel}>
      <p className="text-ds-sm text-normal">As prévias de link desta mensagem somem para todo mundo.</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={busy}>
          Remover
        </Button>
      </div>
    </Modal>
  )
}
