/**
 * Barra de ações da mensagem (como no Discord): as reações rápidas, os itens
 * do menu "Mais" conforme o que a pessoa pode fazer e onde o menu abre sem
 * sair da tela.
 */
import { nextMenuIndex } from '../../../shared/lib/menuNav'
import { QUICK_EMOTES } from './emotes'

/** Quantas reações rápidas a barra mostra. */
export const QUICK_REACTION_COUNT = 3

/**
 * Reações rápidas da barra. Ainda não guardamos as mais usadas/recentes,
 * então são as primeiras das reações rápidas de sempre.
 */
export function quickReactions(
  base: readonly string[] = QUICK_EMOTES,
  count = QUICK_REACTION_COUNT
): string[] {
  return [...new Set(base)].slice(0, count)
}

export type MessageMenuAction =
  | 'react'
  | 'edit'
  | 'reply'
  | 'pin'
  | 'unpin'
  | 'favorite'
  | 'unfavorite'
  | 'copy'
  | 'delete'

export interface MessageMenuItem {
  action: MessageMenuAction
  label: string
  /** Ação destrutiva: em vermelho. */
  danger?: boolean
}

export interface MessageMenuInput {
  canReact: boolean
  /** Minha mensagem, editável e fora da edição. */
  canEdit: boolean
  canPin: boolean
  isPinned: boolean
  /** Pode entrar na lista pessoal de favoritas (mensagem já enviada). */
  canFavorite?: boolean
  isFavorite?: boolean
  /** Tem texto para copiar. */
  canCopy: boolean
  canDelete: boolean
  deleteLabel: string
}

/**
 * Itens do "Mais", em grupos separados por divisória como no Discord: reagir,
 * editar e responder; fixar, favoritar e copiar; excluir por último, em vermelho. Só
 * entram as ações que já existem e que a pessoa pode fazer; grupo vazio some.
 */
export function messageMenuGroups(input: MessageMenuInput): MessageMenuItem[][] {
  const pin: MessageMenuItem = input.isPinned
    ? { action: 'unpin', label: 'Desafixar mensagem' }
    : { action: 'pin', label: 'Fixar mensagem' }
  const favorite: MessageMenuItem = input.isFavorite
    ? { action: 'unfavorite', label: 'Remover das favoritas' }
    : { action: 'favorite', label: 'Favoritar' }
  const groups: (MessageMenuItem | false)[][] = [
    [
      input.canReact && { action: 'react', label: 'Adicionar reação' },
      input.canEdit && { action: 'edit', label: 'Editar mensagem' },
      { action: 'reply', label: 'Responder' }
    ],
    [
      input.canPin && pin,
      Boolean(input.canFavorite) && favorite,
      input.canCopy && { action: 'copy', label: 'Copiar texto' }
    ],
    [input.canDelete && { action: 'delete', label: input.deleteLabel, danger: true }]
  ]
  return groups
    .map((group) => group.filter((item): item is MessageMenuItem => item !== false))
    .filter((group) => group.length > 0)
}

interface Rect {
  top: number
  bottom: number
  left: number
  right: number
}

interface Size {
  width: number
  height: number
}

const GAP = 4

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max))

/**
 * Onde o menu abre: embaixo do botão e alinhado pela direita dele; sem espaço
 * embaixo, em cima. Nunca sai da janela (margem de 8px em volta).
 */
export function menuPosition(
  anchor: Rect,
  menu: Size,
  viewport: Size,
  margin = 8
): { left: number; top: number } {
  const left = clamp(anchor.right - menu.width, margin, viewport.width - menu.width - margin)
  const below = anchor.bottom + GAP
  const fitsBelow = below + menu.height <= viewport.height - margin
  const top = fitsBelow ? below : anchor.top - GAP - menu.height
  return { left, top: clamp(top, margin, viewport.height - menu.height - margin) }
}

/**
 * Tecla no menu aberto: Esc e Tab fecham ('close'); setas, Home e End dizem
 * qual item focar; o resto não é com o menu (null).
 */
export function menuKeyAction(
  key: string,
  current: number,
  count: number
): 'close' | number | null {
  if (key === 'Escape' || key === 'Tab') return 'close'
  return nextMenuIndex(current, count, key)
}
