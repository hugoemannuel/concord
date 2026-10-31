/** Quantos confirmaram presença, no singular ou no plural. */
export function goingText(count: number): string {
  if (count === 0) return 'Ninguém confirmou ainda'
  return count === 1 ? '1 vai' : `${count} vão`
}
