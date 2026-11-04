// "Usados com frequência": cada uso soma, e o peso cai pela metade a cada 14
// dias, para o que a pessoa parou de usar sair da frente.

export interface UseRecord {
  count: number
  last: number
}

export type UseMap = Record<string, UseRecord>

const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000
const MAX_ENTRIES = 64

export function recordUse(map: UseMap, key: string, now: number, maxEntries = MAX_ENTRIES): UseMap {
  const next: UseMap = { ...map, [key]: { count: (map[key]?.count ?? 0) + 1, last: now } }
  const keys = Object.keys(next)
  if (keys.length <= maxEntries) return next
  const oldest = keys.reduce((a, b) => (next[a].last <= next[b].last ? a : b))
  delete next[oldest]
  return next
}

export function rankUses(map: UseMap, now: number): string[] {
  const score = (r: UseRecord): number => r.count * 0.5 ** ((now - r.last) / HALF_LIFE_MS)
  return Object.keys(map).sort((a, b) => score(map[b]) - score(map[a]))
}
