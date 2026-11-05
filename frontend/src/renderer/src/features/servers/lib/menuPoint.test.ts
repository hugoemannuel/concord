import { describe, expect, it } from 'vitest'
import { clampMenuPosition, menuPointFor } from './menuPoint'

const rect = { left: 10, right: 58, top: 100, height: 48 }

describe('menuPointFor', () => {
  it('mouse e toque: o ponto do evento', () => {
    expect(menuPointFor({ clientX: 30, clientY: 120 }, rect)).toEqual({ x: 30, y: 120 })
  })

  it('teclado (0, 0): ao lado do ícone, no meio da altura', () => {
    expect(menuPointFor({ clientX: 0, clientY: 0 }, rect)).toEqual({ x: 62, y: 124 })
  })
})

describe('clampMenuPosition', () => {
  const viewport = { width: 360, height: 640 }
  const size = { width: 220, height: 300 }

  it('cabendo, não mexe', () => {
    expect(clampMenuPosition({ x: 20, y: 40 }, size, viewport)).toEqual({ x: 20, y: 40 })
  })

  it('perto da borda direita e de baixo, recua para caber', () => {
    expect(clampMenuPosition({ x: 340, y: 600 }, size, viewport)).toEqual({ x: 132, y: 332 })
  })

  it('menu mais alto que a tela fica colado no topo (e rola por dentro)', () => {
    expect(clampMenuPosition({ x: 0, y: 500 }, { width: 220, height: 900 }, viewport)).toEqual({ x: 8, y: 8 })
  })
})
