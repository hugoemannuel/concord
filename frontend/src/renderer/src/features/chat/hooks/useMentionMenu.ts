import { useAuthStore } from '../../auth/store/authStore'
import { mentionMenu } from '../lib/chatPaneView'
import { nextHighlight } from '../lib/composerKeys'
import { applyMention, mentionQuery, type MentionSuggestion, type UserSuggestionInput } from '../lib/mentions'
import { useRoomState } from './useRoomState'

const MAX_SUGGESTIONS = 6

interface Options {
  room: string
  draft: string
  /** Troca o texto do campo (com o aviso de digitando). */
  replaceDraft: (text: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  mentionable: UserSuggestionInput[]
  canMentionEveryone: boolean
}

export interface MentionMenu {
  open: boolean
  suggestions: MentionSuggestion[]
  highlight: number
  /** Texto digitado: abre/atualiza o menu conforme o @ antes do cursor. */
  onInput: (text: string, caret: number) => void
  pick: (username: string) => void
  step: (step: 1 | -1) => void
  setHighlight: (index: number | null) => void
  close: () => void
  /** Fecha e esquece o destaque (mensagem enviada). */
  reset: () => void
}

/** Cursor no campo; sem seleção, o fim do texto. */
const caretOf = (el: HTMLInputElement, draft: string): number => el.selectionStart ?? draft.length

/** Menu de sugestões do @ no campo de mensagem (estado por sala). */
export function useMentionMenu({
  room,
  draft,
  replaceDraft,
  inputRef,
  mentionable,
  canMentionEveryone
}: Options): MentionMenu {
  const meUsername = useAuthStore((s) => s.user?.username)
  const [mention, setMention] = useRoomState<{ query: string; start: number } | null>(room, null)
  const [highlightChoice, setHighlight] = useRoomState<number | null>(room, null)
  const { suggestions, highlight } = mentionMenu(
    mention,
    highlightChoice,
    mentionable,
    canMentionEveryone,
    meUsername,
    MAX_SUGGESTIONS
  )

  const pick = (username: string): void => {
    const el = inputRef.current
    if (!mention || !el) return
    const next = applyMention(draft, mention.start, caretOf(el, draft), username)
    replaceDraft(next.text)
    setMention(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.caret, next.caret)
    })
  }

  return {
    open: mention !== null,
    suggestions,
    highlight,
    onInput: (text, caret) => {
      setMention(mentionQuery(text, caret))
      setHighlight(null)
    },
    pick,
    step: (step) => setHighlight(nextHighlight(highlight, step, suggestions.length)),
    setHighlight,
    close: () => setMention(null),
    reset: () => {
      setMention(null)
      setHighlight(null)
    }
  }
}
