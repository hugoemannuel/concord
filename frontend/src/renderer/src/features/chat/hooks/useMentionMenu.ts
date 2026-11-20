import { useAuthStore } from '../../auth/store/authStore'
import { mentionMenu } from '../lib/chatPaneView'
import { stepHighlight, type SuggestionMenu } from '../../../shared/lib/suggestionNav'
import { applyMention, mentionQuery, type MentionSuggestion, type UserSuggestionInput } from '../lib/mentions'
import { picksInText, roleIdsToSend, withRolePick, type MentionableRole, type RolePicks } from '../lib/roleMentions'
import { picksOf, useMentionPicksStore } from '../store/mentionPicksStore'
import { useRoomState } from './useRoomState'

const MAX_SUGGESTIONS = 6

interface Options {
  room: string
  /** id do listbox (o campo aponta para ele). */
  listId: string
  draft: string
  /** Troca o texto do campo (com o aviso de digitando). */
  replaceDraft: (text: string) => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  mentionable: UserSuggestionInput[]
  canMentionEveryone: boolean
  /** Cargos do servidor (canal de servidor); em DM e grupo, nenhum. */
  roles: MentionableRole[]
}

export interface MentionMenu extends SuggestionMenu {
  open: boolean
  suggestions: MentionSuggestion[]
  /** Texto digitado: abre/atualiza o menu conforme o @ antes do cursor. */
  onInput: (text: string, caret: number) => void
  pick: (item: MentionSuggestion) => void
  /** Ids dos cargos que `text` menciona (as escolhas da lista e os escritos à mão). */
  roleIdsFor: (text: string) => string[]
  setHighlight: (index: number | null) => void
  /**
   * Esquece os cargos escolhidos que não estão mais em `text` (o que está no
   * campo depois de a mensagem sair).
   */
  keepPicksIn: (text: string) => void
  /** Fecha e esquece o destaque (mensagem enviada). */
  reset: () => void
}

/** Cursor no campo; sem seleção, o fim do texto. */
const caretOf = (el: HTMLTextAreaElement, draft: string): number => el.selectionStart ?? draft.length

/** Menu de sugestões do @ no campo de mensagem (estado por sala). */
export function useMentionMenu({
  room,
  listId,
  draft,
  replaceDraft,
  inputRef,
  mentionable,
  canMentionEveryone,
  roles
}: Options): MentionMenu {
  const meUsername = useAuthStore((s) => s.user?.username)
  const [mention, setMention] = useRoomState<{ query: string; start: number } | null>(room, null)
  const [highlightChoice, setHighlight] = useRoomState<number | null>(room, null)
  // Os cargos escolhidos ficam num store, como o rascunho: valem se o envio
  // falhar e o texto voltar, e se a pessoa sair da sala e voltar.
  const rolePicks = useMentionPicksStore((s) => picksOf(s, room))
  const setRolePicks = (next: (prev: RolePicks) => RolePicks): void =>
    useMentionPicksStore.getState().update(room, next)
  const { suggestions, highlight } = mentionMenu(
    mention,
    highlightChoice,
    mentionable,
    canMentionEveryone,
    meUsername,
    MAX_SUGGESTIONS,
    roles
  )

  const pick = (item: MentionSuggestion): void => {
    const el = inputRef.current
    if (!mention || !el) return
    const next = applyMention(draft, mention.start, caretOf(el, draft), item.username)
    replaceDraft(next.text)
    setRolePicks((picks) => withRolePick(picks, item))
    setMention(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.caret, next.caret)
    })
  }

  return {
    listId,
    open: mention !== null,
    suggestions,
    count: suggestions.length,
    highlight,
    onInput: (text, caret) => {
      setMention(mentionQuery(text, caret))
      setHighlight(null)
      setRolePicks((picks) => picksInText(picks, text))
    },
    keepPicksIn: (text) => setRolePicks((picks) => picksInText(picks, text)),
    pick,
    pickHighlighted: () => pick(suggestions[highlight]),
    roleIdsFor: (text) =>
      roleIdsToSend(
        text,
        rolePicks,
        roles,
        mentionable.map((u) => u.username),
        canMentionEveryone
      ),
    step: (step) => setHighlight(stepHighlight(highlight, step, suggestions.length)),
    setHighlight,
    close: () => setMention(null),
    reset: () => {
      setMention(null)
      setHighlight(null)
    }
  }
}
