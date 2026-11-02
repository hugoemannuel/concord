/** Por que fechou: Esc ou clique fora. */
export type DismissReason = 'escape' | 'outside'

/** Fecha com Esc ou clique fora. `isInside` diz se o alvo do clique é parte do painel. */
export function attachDismiss(
  doc: EventTarget,
  isInside: (target: Node) => boolean,
  onClose: (reason: DismissReason) => void
): () => void {
  const onMouse = (e: Event): void => {
    if (!isInside(e.target as Node)) onClose('outside')
  }
  const onKey = (e: Event): void => {
    if ((e as KeyboardEvent).key === 'Escape') onClose('escape')
  }
  doc.addEventListener('mousedown', onMouse)
  doc.addEventListener('keydown', onKey)
  return () => {
    doc.removeEventListener('mousedown', onMouse)
    doc.removeEventListener('keydown', onKey)
  }
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
