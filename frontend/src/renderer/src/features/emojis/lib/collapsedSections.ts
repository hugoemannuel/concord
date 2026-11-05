// Quais seções do seletor a pessoa recolheu, neste aparelho.

const KEY = 'salinha:picker-collapsed'

let collapsed: Set<string> | null = null

function current(): Set<string> {
  if (collapsed) return collapsed
  try {
    collapsed = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[])
  } catch {
    collapsed = new Set()
  }
  return collapsed
}

export function isCollapsed(id: string): boolean {
  return current().has(id)
}

export function setCollapsed(id: string, value: boolean): void {
  const set = current()
  if (value) set.add(id)
  else set.delete(id)
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]))
  } catch {
    // Sem armazenamento: vale só nesta sessão.
  }
}

/** Testes. */
export function resetCollapsedSections(): void {
  collapsed = null
}
