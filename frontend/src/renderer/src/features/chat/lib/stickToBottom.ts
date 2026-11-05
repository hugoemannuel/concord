import type { BottomScroll } from './scrollAnchor'

/**
 * Peças do grude no fim da lista (useStickToBottom) sem depender do React:
 * executar o plano de rolagem e decidir se o conteúdo que cresce empurra a
 * lista para o fim.
 */

export interface ScrollMetrics {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}

/** Perto do fim: a lista gruda no fim e mensagem nova rola sozinha (px). */
export const STICK_PX = 60

/** Quanto falta rolar até o fim da lista. */
export function distanceFromBottom(m: ScrollMetrics): number {
  return m.scrollHeight - m.scrollTop - m.clientHeight
}

export function isNearBottom(m: ScrollMetrics, px: number = STICK_PX): boolean {
  return distanceFromBottom(m) < px
}

/** Depois de abrir a sala, por quanto tempo (ms) mídia que carrega empurra o fim. */
export const SETTLE_MS = 1500

interface Scroller {
  scrollTop: number
  scrollHeight: number
  scrollTo: (options: ScrollToOptions) => void
}

/**
 * Executa o plano de rolagem ao fim. Devolve até quando (Date.now) acompanhar
 * o conteúdo que cresce, ou null quando não há o que acompanhar.
 *
 * Rola só a lista (scrollTo), nunca scrollIntoView: este rola também os pais
 * com overflow hidden (#root, main) quando a janela é baixa, e o app inteiro
 * subia a cada mensagem nova (#555).
 */
export function applyBottomScroll(
  scroll: BottomScroll,
  scroller: Scroller | null,
  now: number
): number | null {
  if (scroll === 'instant') {
    if (scroller) scroller.scrollTop = scroller.scrollHeight
    return now + SETTLE_MS
  }
  if (scroll === 'smooth') scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  return null
}

/** O conteúdo cresceu: a lista desce junto só no prazo e se a pessoa está no fim. */
export function shouldFollowGrowth(now: number, settleUntil: number, stick: boolean): boolean {
  return now < settleUntil && stick
}

/** O que observar com o ResizeObserver; null se algo não está desenhado ou ele não existe. */
export function resizeTargets<S, C>(
  scroller: S | null,
  content: C | null
): { scroller: S; content: C } | null {
  if (!scroller || !content) return null
  return typeof ResizeObserver === 'undefined' ? null : { scroller, content }
}
