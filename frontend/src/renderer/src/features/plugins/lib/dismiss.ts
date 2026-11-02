/** Fecha com Esc ou clique fora. `isInside` diz se o alvo do clique é parte do painel. */
export function attachDismiss(
  doc: EventTarget,
  isInside: (target: Node) => boolean,
  onClose: () => void
): () => void {
  const onMouse = (e: Event): void => {
    if (!isInside(e.target as Node)) onClose()
  }
  const onKey = (e: Event): void => {
    if ((e as KeyboardEvent).key === 'Escape') onClose()
  }
  doc.addEventListener('mousedown', onMouse)
  doc.addEventListener('keydown', onKey)
  return () => {
    doc.removeEventListener('mousedown', onMouse)
    doc.removeEventListener('keydown', onKey)
  }
}
