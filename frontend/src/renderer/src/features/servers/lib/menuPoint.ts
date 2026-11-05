/** Onde o menu do ícone abre (coordenadas da janela). */
export interface MenuPoint {
  x: number
  y: number
}

interface PointerSource {
  clientX: number
  clientY: number
}

interface RectSource {
  left: number
  right: number
  top: number
  height: number
}

/**
 * De onde abrir o menu. O mouse e o toque trazem o ponto. O teclado (tecla de
 * menu, Shift+F10) manda o contextmenu com (0, 0): aí abre ao lado do próprio
 * ícone, como no Discord.
 */
export function menuPointFor(event: PointerSource, rect: RectSource): MenuPoint {
  if (event.clientX === 0 && event.clientY === 0) {
    return { x: rect.right + 4, y: rect.top + rect.height / 2 }
  }
  return { x: event.clientX, y: event.clientY }
}

/** Posição do menu que cabe na tela: nunca passa da borda direita nem de baixo. */
export function clampMenuPosition(
  point: MenuPoint,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8
): MenuPoint {
  const maxX = Math.max(margin, viewport.width - size.width - margin)
  const maxY = Math.max(margin, viewport.height - size.height - margin)
  return {
    x: Math.min(Math.max(point.x, margin), maxX),
    y: Math.min(Math.max(point.y, margin), maxY)
  }
}

/** Avisa quando o tamanho do elemento muda; devolve o jeito de parar. Sem ResizeObserver, não faz nada. */
export function observeSize(el: Element, onChange: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {}
  const observer = new ResizeObserver(onChange)
  observer.observe(el)
  return () => observer.disconnect()
}
