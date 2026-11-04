// Setas na grade do seletor: as células vêm na ordem da tela, com a posição.

export interface CellBox {
  left: number
  top: number
}

function verticalTarget(cells: CellBox[], index: number, direction: 1 | -1): number {
  const here = cells[index]
  let best = index
  let bestTop: number | null = null
  let bestGap = Infinity
  for (let i = index + direction; i >= 0 && i < cells.length; i += direction) {
    const cell = cells[i]
    if (cell.top === here.top) continue
    if (bestTop !== null && cell.top !== bestTop) break
    bestTop = cell.top
    const gap = Math.abs(cell.left - here.left)
    if (gap < bestGap) {
      bestGap = gap
      best = i
    }
  }
  return best
}

export function nextCell(cells: CellBox[], index: number, key: string): number {
  switch (key) {
    case 'ArrowRight':
      return Math.min(index + 1, cells.length - 1)
    case 'ArrowLeft':
      return Math.max(index - 1, 0)
    case 'ArrowDown':
      return verticalTarget(cells, index, 1)
    case 'ArrowUp':
      return verticalTarget(cells, index, -1)
    default:
      return index
  }
}

/** A seção que está no topo da área que rola: a última que já passou dele (com folga). */
export function activeSectionAt(
  sections: { id?: string; top: number }[],
  scrollTop: number,
  slack = 8
): string | null {
  let current: string | null = null
  for (const section of sections) {
    if (section.top > scrollTop + slack) break
    current = section.id ?? null
  }
  return current
}
