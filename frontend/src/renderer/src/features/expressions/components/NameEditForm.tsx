import { useState, type FormEvent, type KeyboardEvent } from 'react'
import Button from '../../../shared/ui/Button'
import Input from '../../../shared/ui/Input'
import { showToast } from '../../../shared/store/toastStore'
import type { ExpressionKind } from '../lib/expressionRules'
import { saveExpressionEdit, type ExpressionEditValues } from '../lib/expressionEdit'

/** Limites do backend: 32 caracteres no nome, 16 no emoji do som. */
const NAME_MAX = 32
const EMOJI_MAX = 16

/** Esc cancela a edição sem fechar as configurações. */
function cancelOnEscape(e: KeyboardEvent, onCancel: () => void): void {
  if (e.key !== 'Escape') return
  e.preventDefault()
  onCancel()
}

/** Edição em linha do nome (e, nos sons, do emoji). */
export default function NameEditForm({
  kind,
  initialName,
  initialEmoji,
  failMessage,
  save,
  onDone
}: {
  kind: ExpressionKind
  initialName: string
  /** Só nos sons: mostra o campo do emoji (vazio tira). */
  initialEmoji?: string
  failMessage: string
  save: (values: ExpressionEditValues) => Promise<unknown>
  onDone: () => void
}): React.JSX.Element {
  const [name, setName] = useState(initialName)
  const [emoji, setEmoji] = useState(initialEmoji ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setSaving(true)
    const result = await saveExpressionEdit(kind, { name, emoji }, save, failMessage)
    if (result.toast) showToast.error(result.toast)
    if (result.done) return onDone()
    setError(result.error)
    setSaving(false)
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => cancelOnEscape(e, onDone)}
      className="flex min-w-0 flex-1 flex-col gap-2"
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
        {initialEmoji !== undefined && (
          <div className="sm:w-24 sm:shrink-0">
            <Input
              label="Emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={EMOJI_MAX}
              autoComplete="off"
              className="text-center"
            />
          </div>
        )}
        <Input
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
          maxLength={NAME_MAX}
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" loading={saving}>
          Salvar
        </Button>
      </div>
    </form>
  )
}
