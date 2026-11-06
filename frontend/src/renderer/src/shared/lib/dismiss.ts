/** Por que fechou: Esc ou clique fora. */
export type DismissReason = 'escape' | 'outside'

export interface DismissOptions {
  /**
   * Evento do clique fora: 'mousedown' (padrão) ou 'pointerdown', que também
   * pega o toque e a caneta antes do clique.
   */
  event?: 'mousedown' | 'pointerdown'
  /** Falso: o Esc fica com o próprio componente (ex.: navegação do menu). */
  escape?: boolean
}

/**
 * Fecha com Esc ou clique fora. `isInside` diz se o alvo do clique é parte do
 * painel. `onClose` recebe o motivo e o evento (para quem precisa impedir o
 * padrão do Esc).
 */
export function attachDismiss(
  doc: EventTarget,
  isInside: (target: Node) => boolean,
  onClose: (reason: DismissReason, event: Event) => void,
  { event = 'mousedown', escape = true }: DismissOptions = {}
): () => void {
  const onPointer = (e: Event): void => {
    if (!isInside(e.target as Node)) onClose('outside', e)
  }
  const onKey = (e: Event): void => {
    if ((e as KeyboardEvent).key === 'Escape') onClose('escape', e)
  }
  doc.addEventListener(event, onPointer)
  if (escape) doc.addEventListener('keydown', onKey)
  return () => {
    doc.removeEventListener(event, onPointer)
    doc.removeEventListener('keydown', onKey)
  }
}

/** O alvo está dentro de algum destes elementos (o painel, o botão que abriu)? */
export function insideAny(elements: readonly (Node | null | undefined)[], target: Node): boolean {
  return elements.some((el) => Boolean(el?.contains(target)))
}

/** Fecha e, se foi por Esc, devolve o foco a quem abriu; clique fora não rouba o foco. */
export function focusOnEscape(
  close: () => void,
  focus: () => void
): (reason: DismissReason) => void {
  return (reason) => {
    close()
    if (reason === 'escape') focus()
  }
}
