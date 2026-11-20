// Teclado de uma lista de sugestões aberta por um campo de texto (@ de menção,
// comandos do "/"). O foco fica no campo: quem muda é o destaque, e o campo
// aponta o item destacado por aria-activedescendant. Puro, sem DOM.
// Menus que movem o foco de item em item usam `menuNav`.
import { nextMenuIndex } from './menuNav'

/** O que uma lista precisa expor para o campo dirigi-la pelo teclado. */
export interface SuggestionMenu {
  /** id do listbox (o campo aponta para ele). */
  listId: string
  /** Itens à mostra; 0 = lista fechada. */
  count: number
  /** Item destacado, ou -1. */
  highlight: number
  step: (step: 1 | -1) => void
  pickHighlighted: () => void
  close: () => void
}

export interface SuggestionKey {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

export type SuggestionKeyAction = 'step' | 'pick' | 'close'

const isArrow = (key: string): boolean => key === 'ArrowDown' || key === 'ArrowUp'
const isConfirm = (key: string): boolean => key === 'Enter' || key === 'Tab'

/** Com Alt/Ctrl/Meta as setas são atalhos de navegação do app, não da lista. */
const navModifier = (e: SuggestionKey): boolean => e.altKey || e.ctrlKey || e.metaKey

/**
 * Tecla com a lista aberta; null deixa a tecla seguir para as regras do campo
 * (sem destaque, Enter e Tab não escolhem nada sem querer).
 */
export function suggestionKeyAction(
  e: SuggestionKey,
  highlighted: boolean
): SuggestionKeyAction | null {
  if (isArrow(e.key) && !navModifier(e)) return 'step'
  if (isConfirm(e.key) && highlighted) return 'pick'
  return e.key === 'Escape' ? 'close' : null
}

/** Destaque depois de ↓ (1) ou ↑ (-1), dando a volta; sem destaque, ↓ vai ao primeiro e ↑ ao último. */
export function stepHighlight(highlight: number, step: 1 | -1, count: number): number {
  return nextMenuIndex(highlight, count, step > 0 ? 'ArrowDown' : 'ArrowUp') ?? -1
}

/** id de cada opção: o mesmo na lista e no aria-activedescendant do campo. */
export const optionId = (listId: string, index: number): string => `${listId}-${index}`

export interface SuggestionFieldProps {
  'aria-autocomplete': 'list'
  'aria-controls'?: string
  'aria-activedescendant'?: string
}

/** Atributos do campo que abre a lista: qual lista ele controla e qual item está ativo. */
export function suggestionFieldProps(
  menu: Pick<SuggestionMenu, 'listId' | 'count' | 'highlight'>
): SuggestionFieldProps {
  const props: SuggestionFieldProps = { 'aria-autocomplete': 'list' }
  if (menu.count === 0) return props
  props['aria-controls'] = menu.listId
  if (menu.highlight >= 0) props['aria-activedescendant'] = optionId(menu.listId, menu.highlight)
  return props
}
