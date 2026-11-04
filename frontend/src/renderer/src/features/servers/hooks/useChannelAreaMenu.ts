import { useCallback, useEffect, useMemo, useState } from 'react'
import { createHoldGesture, type Point } from '../lib/holdGesture'
import { isEmptyChannelArea } from '../lib/sidebarMenus'

/** Botão direito ou segurar (toque) na parte vazia da lista de canais abre o menu. */
export function useChannelAreaMenu(): {
  point: Point | null
  close: () => void
  areaProps: {
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => void
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
    onPointerUp: () => void
    onPointerCancel: () => void
  }
} {
  const [point, setPoint] = useState<Point | null>(null)
  const hold = useMemo(() => createHoldGesture(setPoint), [])
  useEffect(() => hold.cancel, [hold])
  const close = useCallback(() => setPoint(null), [])
  return {
    point,
    close,
    areaProps: {
      onContextMenu: (event) => {
        if (!isEmptyChannelArea(event.target as Element)) return
        event.preventDefault()
        hold.cancel()
        setPoint({ x: event.clientX, y: event.clientY })
      },
      onPointerDown: (event) => {
        if (event.pointerType !== 'mouse' && isEmptyChannelArea(event.target as Element)) hold.start({ x: event.clientX, y: event.clientY })
      },
      onPointerMove: (event) => hold.move({ x: event.clientX, y: event.clientY }),
      onPointerUp: hold.cancel,
      onPointerCancel: hold.cancel
    }
  }
}
