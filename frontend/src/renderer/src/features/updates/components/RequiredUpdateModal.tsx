import Modal from '../../../shared/ui/Modal'
import Button from '../../../shared/ui/Button'
import { DownloadIcon } from '../../../shared/ui/icons'
import { useUpdateStore } from '../store/updateStore'
import { requiredUpdateStatus, type RequiredUpdateStatus } from '../lib/requiredUpdate'
import { startRequiredUpdate } from '../lib/startRequiredUpdate'

interface ContentProps {
  installed: string
  minVersion: string
  status: RequiredUpdateStatus
  progress: number
  error: string | null
  onUpdate(): void
}

function statusText(status: RequiredUpdateStatus, progress: number): string {
  if (status === 'searching') return 'Procurando a versão nova…'
  if (status === 'downloading') return `Baixando a atualização… ${progress}%`
  return 'Reiniciando para instalar…'
}

/** Corpo do modal obrigatório: o motivo e só o "Atualizar agora" (ADR 0066). */
export function RequiredUpdateContent(p: ContentProps): React.JSX.Element {
  const busy = p.status !== 'idle'
  return (
    <div className="flex flex-col gap-4">
      <p className="text-ds-sm text-normal">
        Sua versão da Salinha (v{p.installed}) não funciona mais com o servidor. Atualize para a v
        {p.minVersion} ou mais nova para continuar.
      </p>
      {p.error && (
        <p role="alert" className="text-ds-sm text-danger">
          {p.error}
        </p>
      )}
      {busy ? (
        <div role="status" className="flex flex-col gap-2">
          <p className="text-ds-sm text-secondary">{statusText(p.status, p.progress)}</p>
          {p.status === 'downloading' && (
            <div
              role="progressbar"
              aria-label="Download da atualização"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={p.progress}
              className="h-1 overflow-hidden rounded-full bg-fg/10"
            >
              <div className="h-full bg-success" style={{ width: `${p.progress}%` }} />
            </div>
          )}
        </div>
      ) : (
        <Button
          variant="success"
          icon={DownloadIcon}
          className="w-full sm:ml-auto sm:w-auto"
          onClick={p.onUpdate}
        >
          Atualizar agora
        </Button>
      )}
    </div>
  )
}

/** Bloqueia o app (sem X, sem Esc, sem clicar fora) até atualizar. Só no desktop. */
function RequiredUpdateModal({
  installed,
  minVersion
}: {
  installed: string
  minVersion: string
}): React.JSX.Element {
  const update = useUpdateStore()
  const status = requiredUpdateStatus({
    requested: update.requested,
    version: update.version,
    ready: update.readyVersion !== null,
    progress: update.progress
  })
  return (
    <Modal open title="Atualização obrigatória">
      <RequiredUpdateContent
        installed={installed}
        minVersion={minVersion}
        status={status}
        progress={update.progress}
        error={update.error}
        onUpdate={startRequiredUpdate}
      />
    </Modal>
  )
}

export default RequiredUpdateModal
