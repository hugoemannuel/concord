import { useState } from 'react'
import Button from '../../../../shared/ui/Button'
import Modal from '../../../../shared/ui/Modal'
import { showToast } from '../../../../shared/store/toastStore'
import { deleteAccount } from '../../../auth/api/account'
import { submitAccountDeletion, type DeletionFailure } from '../../../auth/lib/accountDeletion'
import { endLocalSession } from '../../../profile/store/meActions'
import { ExternalLink } from '../../../legal/components/LegalLinks'
import { ACCOUNT_DELETION_URL } from '../../../legal/lib/legalLinks'
import { Field, inputClass } from '../profile/ProfileField'

/** O que deu errado: a mensagem ou os servidores que impedem. */
function DeletionError({ failure }: { failure: DeletionFailure }): React.JSX.Element {
  if (failure.kind === 'message') {
    return (
      <p role="alert" className="text-ds-xs text-danger">
        {failure.message}
      </p>
    )
  }
  return (
    <div role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-ds-xs text-strong">
      <p>
        Você é dono de servidores que têm outros membros. Transfira a posse (aba Membros
        das configurações do servidor) ou apague cada um antes de excluir a conta:
      </p>
      <ul className="mt-1 list-disc pl-5">
        {failure.servers.map((s) => (
          <li key={s.id} className="break-words">
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Excluir a conta de vez: o que acontece, a senha atual e a marcação de que
 * não dá para desfazer (docs/adr/0038-excluir-a-propria-conta.md).
 */
export default function DeleteAccountModal({
  onClose
}: {
  onClose: () => void
}): React.JSX.Element {
  const [password, setPassword] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [failure, setFailure] = useState<DeletionFailure | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    setBusy(true)
    const result = await submitAccountDeletion({ password, confirmed, send: deleteAccount })
    setFailure(result)
    if (result) {
      setBusy(false)
      return
    }
    showToast.success('Conta excluída.')
    await endLocalSession()
  }

  return (
    <Modal open title="Excluir conta" onClose={busy ? undefined : onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy) void submit()
        }}
      >
        <div className="flex flex-col gap-2 text-ds-sm text-secondary">
          <p>
            A conta é excluída na hora e não dá para desfazer. Saem o perfil, os arquivos dele,
            amizades, conversas a dois e os servidores em que você é o único membro.
          </p>
          <p>
            As mensagens que você mandou em servidores e grupos ficam, como de “Usuário removido”.
            Se quiser que elas sumam, apague-as antes.{' '}
            <ExternalLink href={ACCOUNT_DELETION_URL}>Ver tudo o que acontece</ExternalLink>
          </p>
        </div>
        <Field label="Senha atual">
          <input
            value={password}
            type="password"
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            aria-label="Senha atual"
            autoFocus
          />
        </Field>
        <label className="flex cursor-pointer items-start gap-2 text-ds-sm text-strong">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="focus-ring mt-0.5 h-4 w-4 shrink-0 accent-danger"
          />
          Entendo que a exclusão é definitiva.
        </label>
        {failure && <DeletionError failure={failure} />}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
            className="min-h-10"
          >
            Cancelar
          </Button>
          <Button type="submit" variant="danger" loading={busy} className="min-h-10">
            Excluir conta
          </Button>
        </div>
      </form>
    </Modal>
  )
}
