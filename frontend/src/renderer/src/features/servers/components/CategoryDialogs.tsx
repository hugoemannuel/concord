import { useState } from 'react'
import type { Category } from '../api/categories'
import { createCategory, deleteCategory, renameCategory } from '../api/categories'
import Modal from '../../../shared/ui/Modal'
import Button from '../../../shared/ui/Button'
import Input from '../../../shared/ui/Input'

export type CategoryDialog = { kind: 'create' } | { kind: 'edit' | 'delete'; category: Category }

function saveCategory(serverId: string, dialog: CategoryDialog, name: string): Promise<void> {
  if (dialog.kind === 'create') return createCategory(serverId, name.trim())
  if (dialog.kind === 'delete') return deleteCategory(serverId, dialog.category.id)
  return renameCategory(serverId, dialog.category.id, name.trim())
}

function canSubmit(busy: boolean, deleting: boolean, name: string): boolean {
  return !busy && (deleting || Boolean(name.trim()))
}

export function CategoryDialogs({ serverId, dialog, close, run }: {
  serverId: string
  dialog: CategoryDialog
  close: () => void
  run: (operation: () => Promise<void>) => Promise<boolean>
}): React.JSX.Element {
  const [name, setName] = useState(dialog.kind === 'create' ? '' : dialog.category.name)
  const [busy, setBusy] = useState(false)
  const deleting = dialog.kind === 'delete'
  const title = dialog.kind === 'create' ? 'Criar categoria' : deleting ? 'Excluir categoria' : 'Editar categoria'
  const submit = async (): Promise<void> => {
    if (!canSubmit(busy, deleting, name)) return
    setBusy(true)
    const ok = await run(() => saveCategory(serverId, dialog, name))
    setBusy(false)
    if (ok) close()
  }
  return (
    <Modal open title={title} onClose={close}>
      <form onSubmit={(event) => { event.preventDefault(); void submit() }} className="space-y-4">
        {deleting ? (
          <p className="text-ds-md text-normal">Os canais desta categoria serão mantidos sem categoria.</p>
        ) : (
          <Input label="Nome da categoria" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoFocus />
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>Cancelar</Button>
          <Button type="submit" variant={deleting ? 'danger' : 'primary'} disabled={busy || (!deleting && !name.trim())}>{title}</Button>
        </div>
      </form>
    </Modal>
  )
}
