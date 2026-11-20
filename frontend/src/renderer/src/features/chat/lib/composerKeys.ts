/**
 * Teclas do campo de mensagem (ComposerInput): Enter envia (Shift+Enter quebra
 * a linha), lista de sugestões (@ e comandos do "/"), ↑ para editar a última
 * mensagem e Esc para largar a resposta. Função pura: o componente só executa.
 */
import { suggestionKeyAction, type SuggestionKeyAction } from '../../../shared/lib/suggestionNav'

export type ComposerKeyAction =
  | 'suggestion-step'
  | 'suggestion-pick'
  | 'suggestion-close'
  | 'edit-last'
  | 'cancel-reply'
  | 'send'
  | 'none'

export interface ComposerKey {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

export interface ComposerKeyContext {
  /** Lista de sugestões (@ ou /) aberta com itens. */
  suggesting: boolean
  /** Há item destacado na lista. */
  highlighted: boolean
  draftEmpty: boolean
  replying: boolean
  /** Composição do teclado em andamento (IME, acento morto): Enter confirma, não envia. */
  composing: boolean
  /** Toque é o ponteiro principal: Enter quebra a linha e quem envia é o botão. */
  touch: boolean
}

const SUGGESTION_ACTION: Record<SuggestionKeyAction, ComposerKeyAction> = {
  step: 'suggestion-step',
  pick: 'suggestion-pick',
  close: 'suggestion-close'
}

/** Com Alt/Ctrl/Meta as setas são atalhos de navegação (useGlobalShortcuts). */
const navModifier = (e: ComposerKey): boolean => e.altKey || e.ctrlKey || e.metaKey

/** Lista aberta: null deixa a tecla seguir para as regras do campo. */
function suggestionAction(e: ComposerKey, ctx: ComposerKeyContext): ComposerKeyAction | null {
  const action = ctx.suggesting ? suggestionKeyAction(e, ctx.highlighted) : null
  return action && SUGGESTION_ACTION[action]
}

/** ↑ no campo vazio edita a sua última mensagem (como no Discord). */
function isEditLast(e: ComposerKey, draftEmpty: boolean): boolean {
  return e.key === 'ArrowUp' && draftEmpty && !e.shiftKey && !navModifier(e)
}

/** Enter sozinho envia, como no Discord; no toque não há Shift, então Enter quebra a linha. */
function isSend(e: ComposerKey, ctx: ComposerKeyContext): boolean {
  return e.key === 'Enter' && !e.shiftKey && !ctx.composing && !ctx.touch
}

export function composerKeyAction(e: ComposerKey, ctx: ComposerKeyContext): ComposerKeyAction {
  const suggestion = suggestionAction(e, ctx)
  if (suggestion) return suggestion
  if (isSend(e, ctx)) return 'send'
  if (isEditLast(e, ctx.draftEmpty)) return 'edit-last'
  return e.key === 'Escape' && ctx.replying ? 'cancel-reply' : 'none'
}
