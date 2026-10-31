import { useState } from 'react'
import Button from '../../../../shared/ui/Button'
import SectionHeader from '../../../../shared/ui/SectionHeader'
import DeleteAccountModal from './DeleteAccountModal'

/** Minha conta → o fim da página: excluir a conta. */
export default function AccountDangerZone(): React.JSX.Element {
  const [deleting, setDeleting] = useState(false)
  return (
    <section className="mt-6">
      <SectionHeader as="h2" className="mb-2">
        Remoção de conta
      </SectionHeader>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-subtle p-4">
        <p className="min-w-0 flex-1 basis-60 text-ds-sm text-secondary">
          Excluir a conta apaga os seus dados de vez. Não dá para desfazer.
        </p>
        <Button variant="danger" size="sm" onClick={() => setDeleting(true)} className="min-h-10">
          Excluir conta
        </Button>
      </div>
      {deleting && <DeleteAccountModal onClose={() => setDeleting(false)} />}
    </section>
  )
}
