import { describe, expect, it } from 'vitest'
import { nextCell } from './gridNav'

// Duas linhas de três, e uma terceira só com uma.
const cells = [
  { left: 0, top: 0 },
  { left: 40, top: 0 },
  { left: 80, top: 0 },
  { left: 0, top: 40 },
  { left: 40, top: 40 },
  { left: 80, top: 40 },
  { left: 0, top: 80 }
]

describe('nextCell', () => {
  it('esquerda e direita andam na ordem, sem passar das pontas', () => {
    expect(nextCell(cells, 1, 'ArrowRight')).toBe(2)
    expect(nextCell(cells, 3, 'ArrowLeft')).toBe(2)
    expect(nextCell(cells, 0, 'ArrowLeft')).toBe(0)
    expect(nextCell(cells, 6, 'ArrowRight')).toBe(6)
  })

  it('cima e baixo mantêm a coluna', () => {
    expect(nextCell(cells, 1, 'ArrowDown')).toBe(4)
    expect(nextCell(cells, 4, 'ArrowUp')).toBe(1)
  })

  it('na linha mais curta cai na coluna mais perto', () => {
    expect(nextCell(cells, 5, 'ArrowDown')).toBe(6)
  })

  it('sem linha para ir, fica onde está', () => {
    expect(nextCell(cells, 1, 'ArrowUp')).toBe(1)
    expect(nextCell(cells, 6, 'ArrowDown')).toBe(6)
  })

  it('tecla que não é seta não anda', () => {
    expect(nextCell(cells, 1, 'Enter')).toBe(1)
  })
})
