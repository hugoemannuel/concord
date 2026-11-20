// Lista dos comandos do "/" no campo de mensagem: o que aparece e qual item
// vem destacado. Puro; o estado mora no useSlashMenu.
import { slashSuggestions, type SlashSuggestion } from '../../music/lib/music'

export interface SlashMenuState {
  /** Destaque escolhido (setas, mouse) e o texto para o qual ele vale. */
  choice: { input: string; index: number } | null
  /** Texto em que a lista foi fechada com Esc: volta quando o texto muda. */
  dismissed: string | null
}

export const SLASH_MENU_IDLE: SlashMenuState = { choice: null, dismissed: null }

/** O texto já é um comando (ou alias) inteiro: não há o que completar. */
function isComplete(input: string, items: SlashSuggestion[]): boolean {
  const typed = input.toLowerCase()
  return items.some((c) => c.command === typed || c.aliases.includes(typed))
}

/**
 * Comando pela metade: o primeiro vem destacado, e Enter/Tab completam.
 * Comando inteiro: sem destaque, para o Enter enviar como sempre.
 */
function defaultHighlight(input: string, items: SlashSuggestion[]): number {
  return items.length === 0 || isComplete(input, items) ? -1 : 0
}

export function slashMenuView(
  input: string,
  commands: SlashSuggestion[],
  state: SlashMenuState
): { items: SlashSuggestion[]; highlight: number } {
  if (state.dismissed === input) return { items: [], highlight: -1 }
  const items = slashSuggestions(input, commands)
  const chosen = state.choice?.input === input ? state.choice.index : null
  return { items, highlight: chosen ?? defaultHighlight(input, items) }
}
