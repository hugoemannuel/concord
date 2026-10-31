import { useState } from 'react'

/**
 * Hover ou foco dentro de um elemento (mouse, teclado e toque). Faixa e
 * moldura GIF só são montadas com `active`: fora disso a lista baixa só o
 * quadro parado.
 */
export function useHoverActive(): {
  active: boolean
  bind: {
    onMouseEnter: () => void
    onMouseLeave: () => void
    onFocus: () => void
    onBlur: () => void
  }
} {
  const [active, setActive] = useState(false)
  const on = (): void => setActive(true)
  const off = (): void => setActive(false)
  return { active, bind: { onMouseEnter: on, onMouseLeave: off, onFocus: on, onBlur: off } }
}
