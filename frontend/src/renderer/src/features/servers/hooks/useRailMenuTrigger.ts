import { useMemo, useRef } from 'react'
import { createLongPress, swallowNextClick } from '../../../shared/lib/longPress'
import { menuPointFor, type MenuPoint } from '../lib/menuPoint'

export interface RailMenuTrigger {
  onContextMenu: (e: React.MouseEvent<HTMLButtonElement>) => void
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  /** O mesmo cancelamento, para quem já tem o próprio onPointerLeave. */
  cancel: () => void
}

/**
 * Os três jeitos de abrir o menu de um ícone: botão direito (mouse), segurar o
 * dedo (toque) e a tecla de menu/Shift+F10 (teclado, que chega como
 * contextmenu em (0, 0) e abre ao lado do ícone).
 */
export function useRailMenuTrigger(open: (point: MenuPoint) => void): RailMenuTrigger {
  const button = useRef<HTMLButtonElement | null>(null)
  const openRef = useRef(open)
  openRef.current = open

  return useMemo(() => {
    const press = createLongPress(() => {
      const el = button.current
      if (!el) return
      // O clique que o navegador ainda manda ao soltar não pode cair no menu novo.
      swallowNextClick(document)
      // Sem ponto de mouse: abre ao lado do ícone, como no teclado.
      openRef.current(menuPointFor({ clientX: 0, clientY: 0 }, el.getBoundingClientRect()))
    })
    return {
      onContextMenu: (e) => {
        e.preventDefault()
        // O Android manda contextmenu junto com o segurar: não abre duas vezes.
        if (press.firedRecently()) return
        openRef.current(menuPointFor(e, e.currentTarget.getBoundingClientRect()))
      },
      onPointerDown: (e) => {
        button.current = e.currentTarget
        press.down(e)
      },
      onPointerMove: (e) => press.move(e),
      onPointerUp: press.cancel,
      onPointerCancel: press.cancel,
      cancel: press.cancel
    }
  }, [])
}
