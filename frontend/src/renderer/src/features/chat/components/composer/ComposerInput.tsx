import { composerKeyAction, type ComposerKeyAction } from '../../lib/composerKeys'
import type { MentionMenu } from '../../hooks/useMentionMenu'

type KeyHandlers = Record<ComposerKeyAction, (e: React.KeyboardEvent<HTMLInputElement>) => void>

function keyHandlers(
  menu: MentionMenu,
  onEditLast: () => boolean,
  cancelReply: () => void
): KeyHandlers {
  return {
    'mention-step': (e) => {
      e.preventDefault()
      menu.step(e.key === 'ArrowDown' ? 1 : -1)
    },
    'mention-pick': (e) => {
      e.preventDefault()
      menu.pick(menu.suggestions[menu.highlight].username)
    },
    'mention-close': () => menu.close(),
    'edit-last': (e) => {
      if (onEditLast()) e.preventDefault()
    },
    'cancel-reply': cancelReply,
    none: () => {}
  }
}

export interface ComposerInputProps {
  inputRef: React.RefObject<HTMLInputElement | null>
  value: string
  placeholder: string
  menu: MentionMenu
  replying: boolean
  /** Texto novo e posição do cursor. */
  onChange: (text: string, caret: number) => void
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void
  /** ↑ no campo vazio: abre a última mensagem minha na edição (false se não há). */
  onEditLast: () => boolean
  onCancelReply: () => void
}

/** Campo de texto da mensagem: teclas (menu do @, ↑ editar, Esc largar a resposta) e colar. */
export default function ComposerInput(p: ComposerInputProps): React.JSX.Element {
  const { menu } = p
  const keys = keyHandlers(menu, p.onEditLast, p.onCancelReply)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void =>
    keys[
      composerKeyAction(e, {
        suggesting: menu.suggestions.length > 0,
        highlighted: menu.highlight >= 0,
        draftEmpty: p.value === '',
        replying: p.replying
      })
    ](e)

  return (
    <input
      ref={p.inputRef}
      value={p.value}
      onChange={(e) => p.onChange(e.target.value, e.target.selectionStart ?? 0)}
      onKeyDown={handleKeyDown}
      onPaste={p.onPaste}
      onBlur={menu.close}
      placeholder={p.placeholder}
      maxLength={2000}
      className="min-w-0 flex-1 bg-transparent text-ds-chat text-strong placeholder:text-gray-500 outline-none"
    />
  )
}
