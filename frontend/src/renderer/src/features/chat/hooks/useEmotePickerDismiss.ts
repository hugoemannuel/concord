import { useEffect, type RefObject } from 'react'
import { useDismiss } from '../../../shared/hooks/useDismiss'
import { insideAny } from '../../../shared/lib/dismiss'

/**
 * Fecha o seletor de emoji: clique fora (o botão que o abriu não conta, para
 * clicar nele de novo fechar em vez de reabrir) e Esc, que devolve o foco ao
 * botão. Flutuando ao lado de um botão (`floating`), rolar a lista ou
 * redimensionar a janela também fecha, pois o botão sai de baixo dele.
 */
export function useEmotePickerDismiss(
  ref: RefObject<HTMLElement | null>,
  anchor: HTMLElement | null,
  floating: boolean,
  onClose: () => void
): void {
  useDismiss(
    (target) => insideAny([ref.current, anchor], target),
    (reason) => {
      onClose()
      if (reason === 'escape' && anchor?.isConnected) anchor.focus()
    }
  )

  useEffect(() => {
    if (!floating) return
    // A rolagem da própria lista de emojis não fecha.
    const onScroll = (e: Event): void => {
      if (!(e.target instanceof Node && ref.current?.contains(e.target))) onClose()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [ref, floating, onClose])
}
