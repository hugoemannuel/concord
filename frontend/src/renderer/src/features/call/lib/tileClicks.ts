import { isInteractiveTarget, type ClickDisambiguator } from './fullscreenControls'

type Clicks = Pick<ClickDisambiguator, 'click' | 'cancel'>

/** Clique abre o foco; com tela cheia possível, espera a janela do duplo clique. */
export function routeTileClick(
  clicks: Clicks,
  onClick: (() => void) | undefined,
  inFullscreen: boolean,
  canFullscreen: boolean
): void {
  if (!onClick || inFullscreen) return
  if (canFullscreen) clicks.click(onClick)
  else onClick()
}

/** Duplo clique (fora de botões e controles) alterna a tela cheia e cancela o clique pendente. */
export function routeTileDoubleClick(
  clicks: Clicks,
  canFullscreen: boolean,
  target: Element,
  toggleFullscreen: () => void
): void {
  if (!canFullscreen || isInteractiveTarget(target)) return
  clicks.cancel()
  toggleFullscreen()
}
