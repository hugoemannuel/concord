// Forma de um tema próprio → variáveis CSS: cantos (escala do raio do Tailwind),
// densidade (--spacing) e fonte da interface (--font-sans). Só fontes que já
// vêm no app ou no sistema: nada para baixar. Puro.

import type { Density, FontId, ThemeShape } from './themeInput'

/** Raios do Tailwind usados no app (rem), na escala padrão. */
const RADII: Record<string, number> = {
  radius: 0.25,
  'radius-xs': 0.125,
  'radius-sm': 0.25,
  'radius-md': 0.375,
  'radius-lg': 0.5,
  'radius-xl': 0.75,
  'radius-2xl': 1
}

/** --spacing do Tailwind (o padrão é 0.25rem). */
export const SPACING: Record<Density, string | null> = {
  compact: '0.225rem',
  normal: null,
  comfortable: '0.275rem'
}

const EMOJI = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'"

export const FONT_STACKS: Record<FontId, string | null> = {
  outfit: null,
  system: `system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', Ubuntu, Cantarell, sans-serif, ${EMOJI}`,
  serif: `Georgia, Cambria, 'Noto Serif', 'Times New Roman', serif, ${EMOJI}`,
  mono: 'var(--font-mono)'
}

const rem = (n: number): string => `${Math.round(n * 1000) / 1000}rem`

export interface ShapeCss {
  /** Valem sempre. */
  always: string[]
  /** Só com mouse (pointer: fine): no toque o alvo de 40 px não encolhe. */
  finePointer: string[]
}

export function shapeCss({ radius, density, font }: ThemeShape): ShapeCss {
  const always: string[] = []
  if (radius !== 100) {
    for (const [name, base] of Object.entries(RADII)) always.push(`--${name}: ${rem((base * radius) / 100)};`)
  }
  const spacing = SPACING[density]
  if (spacing && density === 'comfortable') always.push(`--spacing: ${spacing};`)
  const stack = FONT_STACKS[font]
  if (stack) always.push(`--font-sans: ${stack};`)
  return { always, finePointer: spacing && density === 'compact' ? [`--spacing: ${spacing};`] : [] }
}
