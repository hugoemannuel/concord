import { describe, expect, it } from 'vitest'
import { nextWindowPosition, pastDragThreshold } from './windowDrag'

describe('nextWindowPosition', () => {
  it('soma o deslocamento do cursor à posição inicial da janela', () => {
    const anchor = { pointerX: 500, pointerY: 300, winX: 100, winY: 50 }
    expect(nextWindowPosition(anchor, 520, 280)).toEqual({ x: 120, y: 30 })
  })

  it('não prende a janela ao monitor onde o arraste começou', () => {
    // Monitor principal: 0..1920. Monitor secundário começa em x=1920.
    const anchor = { pointerX: 1900, pointerY: 100, winX: 1700, winY: 100 }
    // Arrasta 400px para a direita: janela termina dentro do segundo monitor.
    expect(nextWindowPosition(anchor, 2300, 100)).toEqual({ x: 2100, y: 100 })
  })
})

describe('pastDragThreshold', () => {
  const anchor = { pointerX: 500, pointerY: 300 }

  it('um clique (sem mexer o mouse) não passa do limiar', () => {
    expect(pastDragThreshold(anchor, 500, 300)).toBe(false)
  })

  it('um tremor de 1px também não conta como arraste', () => {
    expect(pastDragThreshold(anchor, 501, 300)).toBe(false)
  })

  it('mexer de verdade passa do limiar', () => {
    expect(pastDragThreshold(anchor, 520, 300)).toBe(true)
  })
})
