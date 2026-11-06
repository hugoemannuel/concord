import type { RefObject } from 'react'
import { useDismiss } from '../../../shared/hooks/useDismiss'
import { insideElement } from '../lib/insideElement'

/** O clique foi fora do seletor? */
export function isOutside(container: HTMLElement | null, target: EventTarget | null): boolean {
  return Boolean(container) && !insideElement(container, target)
}

/**
 * Fecha o seletor de mídia com clique fora ou Esc. Com um modal aberto por
 * cima (`blocked`, ex.: enviar figurinha ou emoji), não fecha: o modal fica
 * fora do seletor e o clique nele não pode derrubar os dois.
 */
export function useMediaPickerDismiss(
  ref: RefObject<HTMLElement | null>,
  blocked: boolean,
  onClose: () => void
): void {
  useDismiss((target) => !isOutside(ref.current, target), () => onClose(), { enabled: !blocked })
}
