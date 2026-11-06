import type { MusicItem, MusicState } from '../api/music'
import { QUEUE_PREVIEW, T17 } from './music'

/** Clique fora do painel fecha. O Maestro (tile ou linha da lateral) fica de fora:
 *  ele mesmo alterna, senão o clique fecharia e reabriria na sequência. */
export function isOutsidePanel(target: Element | null, panel: HTMLElement | null): boolean {
  return !!target && !panel?.contains(target) && !target.closest('[data-maestro-tile]')
}

/** Largura da barra de progresso (0–100) a partir dos segundos tocados. */
export function progressPercent(elapsedSec: number, durationMs: number): number {
  return Math.min(100, ((elapsedSec * 1000) / Math.max(1, durationMs)) * 100)
}

/** A fila recolhida mostra só as primeiras; "Ver mais" mostra todas. */
export function visibleQueue(queue: MusicItem[], showAll: boolean): MusicItem[] {
  return showAll ? queue : queue.slice(0, QUEUE_PREVIEW)
}

/** Botão de pular: quem pediu pula direto; os outros votam (uma vez). */
export function skipView(
  now: MusicItem,
  skip: MusicState['skip'],
  meId: string | null | undefined
): { label: string; disabled: boolean } {
  const mineNow = now.requested_by.id === meId
  const voted = !!meId && skip.voters.includes(meId)
  return {
    label: mineNow ? T17.skip : T17.vote(skip.votes, skip.needed),
    disabled: !mineNow && voted
  }
}
