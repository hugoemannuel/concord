/** Percentil pelo posto mais próximo (o valor de verdade de uma medida); null se vazio. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.max(0, rank - 1)]
}
