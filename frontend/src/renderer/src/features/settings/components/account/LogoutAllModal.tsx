import { useState } from 'react'
import Button from '../../../../shared/ui/Button'
import Modal from '../../../../shared/ui/Modal'
import { showToast } from '../../../../shared/store/toastStore'
import { logoutEverywhere } from '../../../profile/store/meActions'

/** Confirma "Sair de todos os dispositivos" (este também sai). */
export default function LogoutAllModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async (): Promise<void> => {
    setBusy(true)
    try {
      await logoutEverywhere()
      showToast.success('Você saiu de todos os dispositivos.')
    } catch {
      setError('Não foi possível encerrar as sessões. Tente de novo.')
      setBusy(false)
    }
  }

  return (
    <Modal open title="Sair de todos os dispositivos" onClose={busy ? undefined : onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-ds-sm text-secondary">
          Todos os aparelhos e navegadores em que a sua conta está aberta saem na hora, inclusive
          este. Para voltar, é só entrar de novo com a senha.
        </p>
        {error && (
          <p role="alert" className="text-ds-xs text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy} className="min-h-10">
            Cancelar
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void confirm()} className="min-h-10">
            Sair de todos
          </Button>
        </div>
      </div>
    </Modal>
  )
}
