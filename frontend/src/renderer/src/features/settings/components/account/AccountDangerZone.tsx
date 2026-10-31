import { useState } from 'react'
import Button from '../../../../shared/ui/Button'
import SectionHeader from '../../../../shared/ui/SectionHeader'
import DeleteAccountModal from './DeleteAccountModal'
import LogoutAllModal from './LogoutAllModal'

type Dialog = 'logout-all' | 'delete'

function ActionRow({
  text,
  action,
  onClick
}: {
  text: string
  action: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <p className="min-w-0 flex-1 basis-60 text-ds-sm text-secondary">{text}</p>
      <Button variant="danger" size="sm" onClick={onClick} className="min-h-10">
        {action}
      </Button>
    </div>
  )
}

/** Minha conta → o fim da página: encerrar as sessões e excluir a conta. */
export default function AccountDangerZone(): React.JSX.Element {
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const close = (): void => setDialog(null)
  return (
    <section className="mt-6">
      <SectionHeader as="h2" className="mb-2">
        Sessões e remoção de conta
      </SectionHeader>
      <div className="divide-y divide-subtle rounded-lg border border-subtle">
        <ActionRow
          text="Saia da conta em todos os aparelhos e navegadores, inclusive este."
          action="Sair de todos os dispositivos"
          onClick={() => setDialog('logout-all')}
        />
        <ActionRow
          text="Excluir a conta apaga os seus dados de vez. Não dá para desfazer."
          action="Excluir conta"
          onClick={() => setDialog('delete')}
        />
      </div>
      {dialog === 'logout-all' && <LogoutAllModal onClose={close} />}
      {dialog === 'delete' && <DeleteAccountModal onClose={close} />}
    </section>
  )
}
