// Segurar parado no toque: passado o tempo sem o dedo andar, avisa. Andar antes
// disso é rolagem e desiste. Sem React, como o gesto de arrastar.

export const AREA_HOLD_MS = 500
const SLOP = 10

export interface Point {
  x: number
  y: number
}

export interface HoldGesture {
  start: (point: Point) => void
  move: (point: Point) => void
  cancel: () => void
}

export function createHoldGesture(onHold: (point: Point) => void, ms = AREA_HOLD_MS): HoldGesture {
  let timer: ReturnType<typeof setTimeout> | null = null
  let origin: Point = { x: 0, y: 0 }
  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  return {
    start: (point) => {
      cancel()
      origin = point
      timer = setTimeout(() => {
        timer = null
        onHold(origin)
      }, ms)
    },
    move: (point) => {
      if (timer !== null && Math.hypot(point.x - origin.x, point.y - origin.y) >= SLOP) cancel()
    },
    cancel
  }
}
