import type { CSSProperties } from 'react'

/** Cores do tier do nível usadas no preenchimento da barra. */
export interface XpTierColors {
  accent: string
  color: string
}

/** Preenchimento da barra de XP: cinza e sem brilho quando o XP está pausado. */
export function xpFillStyle(tier: XpTierColors, paused: boolean): CSSProperties {
  if (paused) return { backgroundImage: 'linear-gradient(90deg, #4b5563, #374151)' }
  return {
    backgroundImage: `linear-gradient(90deg, ${tier.accent}, ${tier.color})`,
    boxShadow: `0 0 8px ${tier.color}88`
  }
}

export interface Ember {
  /** Posição horizontal na barra. */
  left: string
  /** Desvio lateral da brasa ao subir, em px. */
  dx: number
  /** Atraso do início da animação, em ms. */
  delay: number
}

/** Posições das brasas que sobem da barra: espalhadas e sem aleatoriedade. */
export function emberLayout(count: number): Ember[] {
  return Array.from({ length: count }, (_, i) => ({
    left: `${10 + ((i * 53) % 80)}%`,
    dx: (i % 2 === 0 ? 1 : -1) * (3 + ((i * 7) % 8)),
    delay: i * 230
  }))
}
