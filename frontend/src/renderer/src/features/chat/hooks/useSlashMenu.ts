import type { SlashSuggestion } from '../../music/lib/music'
import { stepHighlight, type SuggestionMenu } from '../../../shared/lib/suggestionNav'
import { SLASH_MENU_IDLE, slashMenuView } from '../lib/slashMenu'
import { useRoomState } from './useRoomState'

interface Options {
  room: string
  /** id do listbox (o campo aponta para ele). */
  listId: string
  draft: string
  /** Comandos que valem aqui (vazio: sem lista). */
  commands: SlashSuggestion[]
  /** Troca o texto do campo pelo comando escolhido. */
  onPick: (text: string) => void
}

export interface SlashMenu extends SuggestionMenu {
  items: SlashSuggestion[]
  pick: (command: SlashSuggestion) => void
  setHighlight: (index: number) => void
  /** Texto digitado: esquece o destaque escolhido e o Esc. */
  onInput: () => void
}

/** Lista dos comandos do "/" no campo de mensagem (estado por sala). */
export function useSlashMenu({ room, listId, draft, commands, onPick }: Options): SlashMenu {
  const [state, setState] = useRoomState(room, SLASH_MENU_IDLE)
  const { items, highlight } = slashMenuView(draft, commands, state)
  const setHighlight = (index: number): void =>
    setState((s) => ({ ...s, choice: { input: draft, index } }))
  const pick = (command: SlashSuggestion): void => onPick(command.command + ' ')

  return {
    listId,
    items,
    count: items.length,
    highlight,
    step: (step) => setHighlight(stepHighlight(highlight, step, items.length)),
    pick,
    pickHighlighted: () => pick(items[highlight]),
    setHighlight,
    onInput: () => setState(SLASH_MENU_IDLE),
    close: () => setState((s) => ({ ...s, dismissed: draft }))
  }
}
