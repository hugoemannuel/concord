/**
 * Teclas do campo de mensagem (ComposerInput): Enter envia (Shift+Enter quebra
 * a linha), menu de @, ↑ para editar a última mensagem e Esc para largar a
 * resposta. Função pura: o componente só executa.
 */

export type ComposerKeyAction =
  | 'mention-step'
  | 'mention-pick'
  | 'mention-close'
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
  /** Menu de sugestões do @ aberto com itens. */
  suggesting: boolean
  /** Há item destacado no menu. */
  highlighted: boolean
  draftEmpty: boolean
  replying: boolean
  /** Composição do teclado em andamento (IME, acento morto): Enter confirma, não envia. */
  composing: boolean
  /** Toque é o ponteiro principal: Enter quebra a linha e quem envia é o botão. */
  touch: boolean
}

const isArrow = (key: string): boolean => key === 'ArrowDown' || key === 'ArrowUp'
const isConfirm = (key: string): boolean => key === 'Enter' || key === 'Tab'

/** Com Alt/Ctrl/Meta as setas são atalhos de navegação (useGlobalShortcuts). */
const navModifier = (e: ComposerKey): boolean => e.altKey || e.ctrlKey || e.metaKey

/** Menu de @ aberto: null deixa a tecla seguir para as regras do campo. */
function mentionKeyAction(e: ComposerKey, highlighted: boolean): ComposerKeyAction | null {
  if (isArrow(e.key) && !navModifier(e)) return 'mention-step'
  if (isConfirm(e.key) && highlighted) return 'mention-pick'
  if (e.key === 'Tab') return 'none' // nada de @all sem querer; Enter sem destaque envia
  return e.key === 'Escape' ? 'mention-close' : null
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
  const mention = ctx.suggesting ? mentionKeyAction(e, ctx.highlighted) : null
  if (mention) return mention
  if (isSend(e, ctx)) return 'send'
  if (isEditLast(e, ctx.draftEmpty)) return 'edit-last'
  return e.key === 'Escape' && ctx.replying ? 'cancel-reply' : 'none'
}

/** Próximo item do menu com as setas; sem destaque, ↓ vai ao primeiro e ↑ ao último. */
export function nextHighlight(highlight: number, step: 1 | -1, length: number): number {
  const from = highlight >= 0 ? highlight : step > 0 ? -1 : 0
  return (from + step + length) % length
}
