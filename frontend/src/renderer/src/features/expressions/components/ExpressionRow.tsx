import type { ReactNode } from 'react'
import IconButton from '../../../shared/ui/IconButton'
import { PencilIcon, TrashIcon } from '../../../shared/ui/icons'

/** Editar e apagar (só para quem pode); sempre visíveis, sem depender de hover. */
export function ExpressionRowActions({
  editLabel,
  deleteLabel,
  onEdit,
  onDelete
}: {
  editLabel: string
  deleteLabel: string
  onEdit: () => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <IconButton icon={PencilIcon} label={editLabel} onClick={onEdit} />
      <IconButton icon={TrashIcon} label={deleteLabel} variant="danger" onClick={onDelete} />
    </span>
  )
}

/**
 * Uma linha da lista de emojis, figurinhas ou sons: a prévia (slot), o nome e
 * o detalhe; editando, o formulário toma o lugar do nome e das ações.
 */
export default function ExpressionRow({
  preview,
  name,
  meta,
  actions = null,
  editor = null
}: {
  preview: ReactNode
  name: string
  meta?: string
  actions?: ReactNode
  editor?: ReactNode
}): React.JSX.Element {
  return (
    <li className="flex items-center gap-3 px-3 py-3 sm:px-4">
      <span className="flex size-12 shrink-0 items-center justify-center">{preview}</span>
      {editor ?? (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-ds-sm font-semibold text-strong">{name}</span>
            {meta && <span className="block truncate text-ds-xs text-muted">{meta}</span>}
          </span>
          {actions}
        </>
      )}
    </li>
  )
}
