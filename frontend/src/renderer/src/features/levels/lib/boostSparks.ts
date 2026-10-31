export interface Spark {
  dx: number
  dy: number
  size: number
  delay: number
}

/** Posições das faíscas que estouram do banner: espalhadas em leque, sem aleatoriedade. */
export function sparkLayout(count: number): Spark[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = ((i / Math.max(1, count)) * 360 + (i % 2) * 11) * (Math.PI / 180)
    const reach = 70 + ((i * 37) % 70)
    return {
      dx: Math.cos(angle) * reach,
      dy: Math.sin(angle) * reach * 0.6,
      size: 3 + (i % 3),
      delay: 120 + (i % 5) * 40
    }
  })
}
