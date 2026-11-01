// Pontos de partida prontos do editor de tema (além dos 8 temas do app) e o
// "Gerar a partir de uma cor". Puro. Ver docs/adr/0041-aparencia-v2.md.

import { mix, rotateHue } from './colorMath'
import { withDefaults, type PaletteInput, type ThemeInput } from './themeInput'
import type { Scheme } from './paletteSurfaces'

export interface Starter {
  id: string
  label: string
  input: ThemeInput
}

const linear = (angle: number, ...colors: string[]): { type: 'linear'; angle: number; colors: string[] } => ({
  type: 'linear',
  angle,
  colors
})

export const STARTERS: Starter[] = [
  {
    // O exemplo da issue #486.
    id: 'vermelho-branco',
    label: 'Vermelho e branco',
    input: {
      ...withDefaults({ accent: '#dc2626', background: '#ffffff', sidebar: '#fff1f2', card: '#ffffff', text: '#1f1f1f', glow: '' }),
      gradients: { accent: linear(135, '#991b1b'), background: linear(180, '#ffe4e6'), sidebar: linear(180, '#fecdd3') },
      highlight: '#991b1b',
      border: '#fca5a5',
      radius: 140
    }
  },
  {
    id: 'carmesim',
    label: 'Carmesim',
    input: {
      ...withDefaults({ accent: '#dc2626', background: '#1c0a0b', sidebar: '#140708', card: '#2a1012', text: '#fdecec', glow: '#b91c1c' }),
      gradients: { accent: linear(135, '#b91c1c'), background: { type: 'radial', angle: 180, colors: ['#0f0506'] } },
      highlight: '#fda4af',
      glass: 60
    }
  },
  {
    id: 'oceano',
    label: 'Oceano',
    input: {
      ...withDefaults({ accent: '#0369a1', background: '#08202e', sidebar: '#061823', card: '#0c2a3b', text: '#e0f2fe', glow: '#0e7490' }),
      gradients: { accent: linear(135, '#2563eb'), background: linear(160, '#0b2f42') },
      highlight: '#5eead4',
      glass: 65
    }
  },
  {
    id: 'aurora',
    label: 'Aurora',
    input: {
      ...withDefaults({ accent: '#15803d', background: '#0b1020', sidebar: '#0a0e1c', card: '#121a30', text: '#e8fff1', glow: '#7c3aed' }),
      gradients: { accent: linear(120, '#0e7490'), background: linear(200, '#0d1a2a') },
      highlight: '#a78bfa',
      glass: 75,
      radius: 150
    }
  },
  {
    id: 'pessego',
    label: 'Pêssego',
    input: {
      ...withDefaults({ accent: '#c2410c', background: '#fff7ed', sidebar: '#ffedd5', card: '#ffffff', text: '#3b1d0b', glow: '' }),
      gradients: { accent: linear(135, '#be185d'), background: linear(135, '#ffe4e6') },
      radius: 160,
      density: 'comfortable'
    }
  },
  {
    id: 'grafite',
    label: 'Grafite',
    input: {
      ...withDefaults({ accent: '#52525b', background: '#18181b', sidebar: '#111113', card: '#202024', text: '#e4e4e7', glow: '' }),
      border: '#3f3f46',
      radius: 30,
      density: 'compact',
      font: 'system'
    }
  }
]

/** Paleta inteira (só as cores) a partir de uma cor: fundos tingidos dela e um realce vizinho. */
export function paletteFromColor(color: string, scheme: Scheme): Omit<PaletteInput, 'glowStrength' | 'glass'> {
  const highlight = rotateHue(color, 40)
  const toward = scheme === 'dark' ? '#000000' : '#ffffff'
  const tone = (c: string, t: number): string => mix(c, toward, t)
  const dark = scheme === 'dark'
  return {
    accent: color,
    background: tone(color, dark ? 0.86 : 0.95),
    sidebar: tone(color, dark ? 0.9 : 0.9),
    card: dark ? tone(color, 0.8) : '#ffffff',
    text: mix(color, dark ? '#ffffff' : '#000000', dark ? 0.92 : 0.85),
    glow: '',
    gradients: {
      accent: linear(135, rotateHue(color, -25)),
      background: linear(160, tone(highlight, dark ? 0.86 : 0.94))
    },
    highlight,
    textMuted: '',
    border: ''
  }
}
