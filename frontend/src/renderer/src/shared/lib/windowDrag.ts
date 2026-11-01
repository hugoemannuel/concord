export interface WindowDragAnchor {
  pointerX: number
  pointerY: number
  winX: number
  winY: number
}

/**
 * Próxima posição da janela (screenX/screenY do cursor, não clientX/clientY):
 * soma o deslocamento sem prender a nenhum monitor. É o que o arraste nativo
 * do Chromium (-webkit-app-region: drag) não faz ao cruzar para outro
 * monitor — ver causa raiz no PR que trocou por esse arraste manual.
 */
export function nextWindowPosition(
  anchor: WindowDragAnchor,
  pointerX: number,
  pointerY: number
): { x: number; y: number } {
  return {
    x: anchor.winX + (pointerX - anchor.pointerX),
    y: anchor.winY + (pointerY - anchor.pointerY)
  }
}

const DRAG_THRESHOLD_PX = 4

/**
 * O gesto já é um arraste de verdade (não um clique parado)? Usado para só
 * desmaximizar a janela quando a pessoa está mesmo arrastando — desmaximizar
 * já no pointerdown restauraria a janela com um clique simples ou o primeiro
 * clique de um duplo-clique.
 */
export function pastDragThreshold(
  anchor: { pointerX: number; pointerY: number },
  pointerX: number,
  pointerY: number
): boolean {
  const dx = pointerX - anchor.pointerX
  const dy = pointerY - anchor.pointerY
  return Math.abs(dx) + Math.abs(dy) >= DRAG_THRESHOLD_PX
}
