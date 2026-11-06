import { useEffect, useRef } from 'react'
import { attachDismiss, type DismissOptions, type DismissReason } from '../lib/dismiss'

export interface UseDismissOptions extends DismissOptions {
  /** Falso: não fecha (ex.: um modal aberto por cima, o menu fechado). */
  enabled?: boolean
  /** Onde escutar: 'document' (padrão) ou 'window'. */
  on?: 'document' | 'window'
}

/**
 * Fecha um popover/menu com clique fora ou Esc (ver lib/dismiss). `isInside` e
 * `onClose` são lidos na hora do evento, sem religar os ouvintes a cada render.
 */
export function useDismiss(
  isInside: (target: Node) => boolean,
  onClose: (reason: DismissReason, event: Event) => void,
  { enabled = true, on = 'document', event = 'mousedown', escape = true }: UseDismissOptions = {}
): void {
  const latest = useRef({ isInside, onClose })
  useEffect(() => {
    latest.current = { isInside, onClose }
  })

  useEffect(() => {
    if (!enabled) return
    return attachDismiss(
      on === 'window' ? window : document,
      (target) => latest.current.isInside(target),
      (reason, e) => latest.current.onClose(reason, e),
      { event, escape }
    )
  }, [enabled, on, event, escape])
}
