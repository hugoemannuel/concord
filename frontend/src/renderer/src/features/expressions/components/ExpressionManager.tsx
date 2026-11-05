import { useState, type ReactNode } from 'react'
import ConfirmModal from '../../friends/components/ConfirmModal'
import { showToast } from '../../../shared/store/toastStore'
import { actionErrorMessage } from '../../servers/lib/permissionErrors'
import type { ExpressionKind } from '../lib/expressionRules'
import type { ExpressionEditValues } from '../lib/expressionEdit'
import { EXPRESSION_TEXTS, expressionDisplayName } from '../lib/expressionTexts'
import type { LoadStatus } from '../lib/loadStatus'
import ExpressionRow, { ExpressionRowActions } from './ExpressionRow'
import { ExpressionListBody, ExpressionToolbar } from './ExpressionListParts'
import NameEditForm from './NameEditForm'

export interface ExpressionItem {
  id: string
  uploader_id: string
  name: string
}

export interface ExpressionManagerProps<T extends ExpressionItem> {
  kind: ExpressionKind
  items: T[]
  status: LoadStatus
  onRetry: () => void
  canAdd: boolean
  canManage: (item: T) => boolean
  /** A prévia de cada item (imagem, figurinha, emoji do som). */
  preview: (item: T) => ReactNode
  meta: (item: T) => string | undefined
  /** Só nos sons: o emoji entra na edição. */
  emojiOf?: (item: T) => string
  save: (item: T, values: ExpressionEditValues) => Promise<unknown>
  remove: (item: T) => Promise<unknown>
  /** O modal de envio que já existe para esse tipo. */
  upload: (close: () => void) => ReactNode
}

/**
 * A gestão de um tipo de expressão do servidor aberto: lista com prévia, envio
 * pelo modal de sempre, edição em linha e apagar com confirmação.
 */
export default function ExpressionManager<T extends ExpressionItem>(
  props: ExpressionManagerProps<T>
): React.JSX.Element {
  const { kind, items, canManage } = props
  const texts = EXPRESSION_TEXTS[kind]
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<T | null>(null)
  const [adding, setAdding] = useState(false)
  const label = (item: T): string => expressionDisplayName(kind, item.name)

  const confirmDelete = async (): Promise<void> => {
    if (!deleting) return
    try {
      await props.remove(deleting)
    } catch (err) {
      showToast.error(actionErrorMessage(err, texts.deleteFail))
    }
  }

  const editorOf = (item: T): ReactNode => (
    <NameEditForm
      kind={kind}
      initialName={item.name}
      initialEmoji={props.emojiOf?.(item)}
      failMessage={texts.editFail}
      save={(values) => props.save(item, values)}
      onDone={() => setEditingId(null)}
    />
  )

  const actionsOf = (item: T): ReactNode => (
    <ExpressionRowActions
      editLabel={texts.edit}
      deleteLabel={texts.remove}
      onEdit={() => setEditingId(item.id)}
      onDelete={() => setDeleting(item)}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <ExpressionToolbar
        kind={kind}
        texts={texts}
        count={items.length}
        canAdd={props.canAdd}
        onAdd={() => setAdding(true)}
      />
      <ExpressionListBody
        status={props.status}
        texts={texts}
        empty={items.length === 0}
        onRetry={props.onRetry}
      >
        {items.map((item) => (
          <ExpressionRow
            key={item.id}
            preview={props.preview(item)}
            name={label(item)}
            meta={props.meta(item)}
            actions={canManage(item) ? actionsOf(item) : null}
            editor={editingId === item.id ? editorOf(item) : null}
          />
        ))}
      </ExpressionListBody>
      {adding && props.upload(() => setAdding(false))}
      <ConfirmModal
        open={deleting !== null}
        title={texts.deleteTitle}
        confirmLabel={texts.deleteTitle}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      >
        <p className="break-words">{deleting ? texts.deleteBody(label(deleting)) : ''}</p>
      </ConfirmModal>
    </div>
  )
}
