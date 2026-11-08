import { useLayoutEffect } from 'react'
import { composerKeyAction, type ComposerKeyAction } from '../../lib/composerKeys'
import { hasFinePointer } from '../../lib/composerFocus'
import type { MentionMenu } from '../../hooks/useMentionMenu'

type KeyEvent = React.KeyboardEvent<HTMLTextAreaElement>
type KeyHandlers = Record<ComposerKeyAction, (e: KeyEvent) => void>

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
    // Mesmo caminho do botão Enviar (o submit do formulário).
    send: (e) => {
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
    },
    none: () => {}
  }
}

export interface ComposerInputProps {
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  placeholder: string
  menu: MentionMenu
  replying: boolean
  /** Texto novo e posição do cursor. */
  onChange: (text: string, caret: number) => void
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  /** ↑ no campo vazio: abre a última mensagem minha na edição (false se não há). */
  onEditLast: () => boolean
  onCancelReply: () => void
}

/**
 * Campo de texto da mensagem, de várias linhas: Enter envia, Shift+Enter quebra
 * a linha (no toque, Enter quebra e o botão envia), menu do @, ↑ editar, Esc
 * largar a resposta e colar. Cresce com o texto até metade da tela e depois rola.
 */
export default function ComposerInput(p: ComposerInputProps): React.JSX.Element {
  const { menu, inputRef } = p
  const keys = keyHandlers(menu, p.onEditLast, p.onCancelReply)
  const handleKeyDown = (e: KeyEvent): void =>
    keys[
      composerKeyAction(e, {
        suggesting: menu.suggestions.length > 0,
        highlighted: menu.highlight >= 0,
        draftEmpty: p.value === '',
        replying: p.replying,
        composing: e.nativeEvent.isComposing,
        touch: !hasFinePointer(window)
      })
    ](e)

  // Altura do texto (o max-h corta em 50% da tela e o resto rola).
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [p.value, inputRef])

  return (
    <textarea
      ref={inputRef}
      value={p.value}
      rows={1}
      onChange={(e) => p.onChange(e.target.value, e.target.selectionStart ?? 0)}
      onKeyDown={handleKeyDown}
      onPaste={p.onPaste}
      onBlur={menu.close}
      placeholder={p.placeholder}
      maxLength={2000}
      className="max-h-[50dvh] min-w-0 flex-1 resize-none self-center overflow-y-auto bg-transparent text-ds-chat text-strong placeholder:text-gray-500 outline-none"
    />
  )
}
