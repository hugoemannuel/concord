import { useState } from 'react'
import { deleteCategory } from '../api/categories'
import { privacyOf, saveCategoryForm } from '../lib/categoryPrivacy'
import { everyoneRole } from '../lib/permissions'
import { useServerStore } from '../store/serverStore'
import type { CategoryDialog } from '../store/channelSidebarStore'
import Modal from '../../../shared/ui/Modal'
import Button from '../../../shared/ui/Button'
import Input from '../../../shared/ui/Input'
import { CategoryPrivacyFields } from './CategoryPrivacyFields'

type FormDialog = Extract<CategoryDialog, { kind: 'create' | 'edit' }>

interface DialogProps {
  serverId: string
  close: () => void
  run: (operation: () => Promise<void>) => Promise<boolean>
}

/** Criar ou editar: nome e, para quem pode mexer em quem vê, a opção de privada. */
function CategoryFormDialog({ serverId, dialog, close, run, canManageRoles }: DialogProps & { dialog: FormDialog; canManageRoles: boolean }): React.JSX.Element {
  const category = dialog.kind === 'edit' ? dialog.category : undefined
  const everyoneId = everyoneRole(useServerStore((s) => s.roles))?.id
  const [before] = useState(() => privacyOf(category, everyoneId))
  const [privacy, setPrivacy] = useState(before)
  const [name, setName] = useState(category?.name ?? '')
  const [busy, setBusy] = useState(false)
  const creating = dialog.kind === 'create'
  const title = creating ? 'Criar categoria' : 'Editar categoria'
  const submit = async (): Promise<void> => {
    if (busy || !name.trim()) return
    setBusy(true)
    const ok = await run(() => saveCategoryForm(serverId, category, name.trim(), before, privacy))
    setBusy(false)
    if (ok) close()
  }
  return (
    <Modal open title={title} onClose={close}>
      <form onSubmit={(event) => { event.preventDefault(); void submit() }} className="space-y-4">
        <Input label="Nome da categoria" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoFocus />
        {(creating || canManageRoles) && <CategoryPrivacyFields value={privacy} onChange={setPrivacy} />}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>{title}</Button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteCategoryDialog({ serverId, dialog, close, run }: DialogProps & { dialog: Extract<CategoryDialog, { kind: 'delete' }> }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const submit = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    const ok = await run(() => deleteCategory(serverId, dialog.category.id))
    setBusy(false)
    if (ok) close()
  }
  return (
    <Modal open title="Excluir categoria" onClose={close}>
      <form onSubmit={(event) => { event.preventDefault(); void submit() }} className="space-y-4">
        <p className="text-ds-md text-normal">
          Os canais de <b className="text-strong">{dialog.category.name}</b> ficam soltos no topo da lista. Nenhum canal é apagado, e os privados continuam privados.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>Cancelar</Button>
          <Button type="submit" variant="danger" disabled={busy}>Excluir categoria</Button>
        </div>
      </form>
    </Modal>
  )
}

export function CategoryDialogs({ dialog, canManageRoles, ...props }: DialogProps & { dialog: Exclude<CategoryDialog, { kind: 'permissions' }>; canManageRoles: boolean }): React.JSX.Element {
  return dialog.kind === 'delete'
    ? <DeleteCategoryDialog {...props} dialog={dialog} />
    : <CategoryFormDialog {...props} dialog={dialog} canManageRoles={canManageRoles} />
}
