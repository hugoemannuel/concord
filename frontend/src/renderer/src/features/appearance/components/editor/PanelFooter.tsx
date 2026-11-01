import { useState } from 'react'
import Button from '../../../../shared/ui/Button'
import { CheckIcon, TrashIcon } from '../../../../shared/ui/icons'
import { adjustmentNotice } from '../../lib/editorText'
import type { Palette } from '../../lib/palette'
import { useCustomThemesStore } from '../../store/customThemesStore'
import { cancelDraft, removeDraft, submitDraft } from '../../store/themeEditorFlow'
import type { Draft } from '../../store/themeEditorStore'

function DeleteButton({ onConfirm }: { onConfirm: () => void }): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)
  return (
    <Button
      variant={confirming ? 'danger' : 'ghost'}
      size="sm"
      icon={TrashIcon}
      onClick={() => (confirming ? onConfirm() : setConfirming(true))}
      onBlur={() => setConfirming(false)}
    >
      {confirming ? 'Confirmar: apagar' : 'Apagar'}
    </Button>
  )
}

/** Aviso do que foi ajustado, erro da conta e as ações. */
export function PanelFooter({ draft, palette }: { draft: Draft; palette: Palette }): React.JSX.Element {
  const saving = useCustomThemesStore((s) => s.saving)
  const error = useCustomThemesStore((s) => s.error)
  const notice = adjustmentNotice(palette.adjusted)
  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-subtle p-3">
      {notice && (
        <p role="status" className="text-ds-xs text-muted">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-ds-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={CheckIcon} loading={saving} onClick={() => void submitDraft()}>
          Salvar e usar
        </Button>
        <Button variant="ghost" onClick={cancelDraft}>
          Cancelar
        </Button>
        {!draft.isNew && (
          <span className="ml-auto">
            <DeleteButton onConfirm={() => void removeDraft()} />
          </span>
        )}
      </div>
    </div>
  )
}
