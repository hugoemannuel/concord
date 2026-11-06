import type { RefObject } from 'react'
import { useDismiss } from '../../../shared/hooks/useDismiss'
import { isOutsidePanel } from '../lib/musicPanel'

/** Painel aberto: clique fora (menos no Maestro) ou Esc fecha. */
export function useMusicPanelDismiss(
  panelOpen: boolean,
  closePanel: () => void,
  panelRef: RefObject<HTMLElement | null>
): void {
  useDismiss((target) => !isOutsidePanel(target as Element, panelRef.current), () => closePanel(), {
    enabled: panelOpen
  })
}
