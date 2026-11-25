// Endereço do painel: /observabilidade/<aba>?dias=<período>. A aba e o período
// ficam na URL para dar para mandar o link de uma aba.

/** Os períodos do seletor, em dias. */
export const PERIODS = [1, 3, 7, 14]
export const DEFAULT_DAYS = 7

/** `?dias=` da URL; fora dos períodos do seletor, o padrão. */
export function daysFromParam(raw: string | null): number {
  const days = Number(raw)
  return PERIODS.includes(days) ? days : DEFAULT_DAYS
}

export function tabPath(id: string, days: number): string {
  return `/observabilidade/${id}?dias=${days}`
}

export function findTab<T extends { id: string }>(
  tabs: T[],
  id: string | undefined
): T | undefined {
  return tabs.find((t) => t.id === id)
}

/** Ids do DOM que ligam a barra de abas ao painel (aria-controls, aria-labelledby). */
export const PANEL_ID = 'obs-panel'
export const tabElementId = (id: string): string => `obs-tab-${id}`
