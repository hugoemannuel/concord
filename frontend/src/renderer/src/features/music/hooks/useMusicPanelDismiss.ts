import { useEffect, type RefObject } from 'react'
import { isOutsidePanel } from '../lib/musicPanel'

/** Painel aberto: clique fora (menos no Maestro) ou Esc fecha. */
export function useMusicPanelDismiss(
  panelOpen: boolean,
  closePanel: () => void,
  panelRef: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    if (!panelOpen) return
    const onDown = (e: MouseEvent): void => {
      if (isOutsidePanel(e.target as Element | null, panelRef.current)) closePanel()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closePanel()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [panelOpen, closePanel, panelRef])
}
