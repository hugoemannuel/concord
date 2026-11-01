import { useRef } from 'react'
import { nextWindowPosition, pastDragThreshold, type WindowDragAnchor } from '../lib/windowDrag'

export interface TitleBarDragHandlers {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onDoubleClick: () => void
}

interface Gesture extends WindowDragAnchor {
  maximized: boolean
}

/**
 * Só desmaximiza (e recomeça o arraste a partir da posição restaurada)
 * quando o gesto já passou do limiar — um clique parado (ou o primeiro
 * clique de um duplo-clique) não deve restaurar a janela maximizada.
 * `pending` (ver useWindowDrag) descarta a resposta se outro gesto já
 * começou enquanto ela ia e voltava pelo IPC.
 */
function maybeRestoreForDrag(
  current: Gesture,
  pending: { current: number },
  e: React.PointerEvent
): void {
  if (!pastDragThreshold(current, e.screenX, e.screenY)) return
  current.maximized = false
  const token = ++pending.current
  void window.api?.windowDrag?.restoreForDrag().then((pos) => {
    if (!pos || pending.current !== token) return
    current.winX = pos.x
    current.winY = pos.y
    current.pointerX = e.screenX
    current.pointerY = e.screenY
  })
}

/**
 * Arraste manual da barra de título (ver shared/lib/windowDrag): substitui o
 * -webkit-app-region: drag nativo do Chromium, que para janela sem moldura
 * não cruza para outro monitor. Duplo clique mantém o maximizar/restaurar que
 * vinha de graça com o arraste nativo.
 *
 * `pending` conta tentativas: cada pointerdown ou restauração em andamento
 * tem um número, e só comita o resultado assíncrono se ninguém soltou o botão
 * (ou começou outro gesto) enquanto isso. O pointerId do mouse é sempre o
 * mesmo, então não dá para usá-lo para distinguir gestos.
 */
export function useWindowDrag(): TitleBarDragHandlers {
  const gesture = useRef<Gesture | null>(null)
  const pending = useRef(0)

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0 || !window.api?.windowDrag) return
    e.currentTarget.setPointerCapture(e.pointerId)
    gesture.current = null
    const token = ++pending.current
    const pointerX = e.screenX
    const pointerY = e.screenY
    void window.api.windowDrag.start().then((pos) => {
      if (!pos || pending.current !== token) return
      gesture.current = { pointerX, pointerY, winX: pos.x, winY: pos.y, maximized: pos.maximized }
    })
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const current = gesture.current
    if (!current) return
    if (current.maximized) {
      maybeRestoreForDrag(current, pending, e)
      return
    }
    const next = nextWindowPosition(current, e.screenX, e.screenY)
    window.api?.windowDrag?.move(next.x, next.y)
  }

  const onPointerUp = (): void => {
    gesture.current = null
    pending.current++
  }

  const onDoubleClick = (): void => {
    window.api?.windowDrag?.toggleMaximize()
  }

  return { onPointerDown, onPointerMove, onPointerUp, onDoubleClick }
}
