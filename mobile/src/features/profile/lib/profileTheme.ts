import { DEFAULT_EXTRAS, resolveExtras, type ProfileThemeExtras } from './profileThemeExtras'

// Tema do cartão de perfil: borda, fundo do corpo (cor ou degradê, como o
// tema de perfil do Nitro), um efeito por cima e as opções finas
// (profileThemeExtras.ts). Os IDs são os do backend (internal/profiletheme);
// profileTheme.test.ts confere as listas.

export interface ProfileTheme extends ProfileThemeExtras {
  border: string
  border_colors: string[]
  background: string
  background_colors: string[]
  effect: string
}

export const DEFAULT_PROFILE_THEME: ProfileTheme = {
  border: 'none',
  border_colors: [],
  background: 'default',
  background_colors: [],
  effect: 'none',
  ...DEFAULT_EXTRAS
}

export const PROFILE_BORDERS = [
  { id: 'none', label: 'Nenhuma', colors: 0 },
  { id: 'solid', label: 'Cor sólida', colors: 1 },
  { id: 'neon', label: 'Neon', colors: 1 },
  { id: 'rainbow', label: 'Arco-íris', colors: 0 },
  { id: 'gradient', label: 'Degradê', colors: 2 }
] as const

export const PROFILE_BACKGROUNDS = [
  { id: 'default', label: 'Padrão', colors: 0 },
  { id: 'solid', label: 'Cor sólida', colors: 1 },
  { id: 'gradient', label: 'Degradê', colors: 2 },
  { id: 'pride', label: 'Arco-íris do orgulho', colors: 0 }
] as const

/**
 * Efeitos: `kind` é o do desktop (os três primeiros são CSS lá). No app todos são cenas do mesmo laço
 * (lib/effects/), então quem desenha olha `canvasScene(id)`, não `kind`. `color` é a cor de sempre do efeito; null = não tem cor
 * para escolher (paleta própria).
 */
export const PROFILE_EFFECTS: readonly {
  id: string
  label: string
  kind: 'none' | 'css' | 'canvas'
  color: string | null
}[] = [
  { id: 'none', label: 'Nenhum', kind: 'none', color: null },
  { id: 'particles', label: 'Partículas', kind: 'css', color: '#c4b5fd' },
  { id: 'sparkles', label: 'Brilhos', kind: 'css', color: '#ffd84d' },
  { id: 'snow', label: 'Neve', kind: 'css', color: '#ffffff' },
  { id: 'fire', label: 'Fogo', kind: 'canvas', color: '#ff7a1a' },
  { id: 'matrix', label: 'Matrix', kind: 'canvas', color: '#22ff88' },
  { id: 'glitch', label: 'Glitch', kind: 'canvas', color: null },
  { id: 'storm', label: 'Tempestade', kind: 'canvas', color: '#9ecbff' },
  { id: 'galaxy', label: 'Galáxia', kind: 'canvas', color: '#a78bfa' },
  { id: 'aurora', label: 'Aurora', kind: 'canvas', color: '#34d399' },
  { id: 'hearts', label: 'Corações', kind: 'canvas', color: '#ff4d8d' },
  { id: 'confetti', label: 'Confete', kind: 'canvas', color: null },
  { id: 'synthwave', label: 'Synthwave', kind: 'canvas', color: '#ff2bd6' },
  { id: 'rain', label: 'Chuva', kind: 'canvas', color: '#7cc4ff' },
  { id: 'fireflies', label: 'Vaga-lumes', kind: 'canvas', color: '#d9f99d' },
  { id: 'sakura', label: 'Sakura', kind: 'canvas', color: '#f9a8d4' },
  { id: 'leaves', label: 'Folhas', kind: 'canvas', color: '#ea8a1f' },
  { id: 'bubbles', label: 'Bolhas', kind: 'canvas', color: '#7dd3fc' },
  { id: 'ocean', label: 'Ondas', kind: 'canvas', color: '#38bdf8' },
  { id: 'meteors', label: 'Estrelas cadentes', kind: 'canvas', color: '#e0f2fe' },
  { id: 'fog', label: 'Névoa', kind: 'canvas', color: '#cbd5e1' },
  { id: 'sunbeams', label: 'Raios de luz', kind: 'canvas', color: '#fde68a' },
  { id: 'lava', label: 'Lava', kind: 'canvas', color: '#ff5a1f' },
  { id: 'money', label: 'Dinheiro', kind: 'canvas', color: '#4ade80' },
  { id: 'clouds', label: 'Nuvens', kind: 'canvas', color: '#ffffff' },
  { id: 'hexagons', label: 'Hexágonos', kind: 'canvas', color: '#22d3ee' },
  { id: 'pixels', label: 'Pixels', kind: 'canvas', color: '#4ade80' },
  { id: 'bunting', label: 'Bandeirinhas', kind: 'canvas', color: null },
  { id: 'fireworks', label: 'Fogos', kind: 'canvas', color: null }
]

/** Definição do efeito (desconhecido = "Nenhum"). */
export function effectDef(id: string): (typeof PROFILE_EFFECTS)[number] {
  return PROFILE_EFFECTS.find((e) => e.id === id) ?? PROFILE_EFFECTS[0]
}

const COLOR = /^#[0-9a-f]{6}$/i
const BORDER_FALLBACK = ['#8b5cf6', '#ec4899']
const BACKGROUND_FALLBACK = ['#5865f2', '#1e1f22']

function cleanColors(raw: unknown, want: number): string[] | null {
  const list = Array.isArray(raw) ? raw : []
  const colors = list
    .filter((c): c is string => typeof c === 'string' && COLOR.test(c))
    .map((c) => c.toLowerCase())
  return colors.length === want && list.length === want ? colors : null
}

/**
 * Tema seguro para desenhar: cada parte inválida (ID desconhecido, cor fora do
 * formato, número de cores errado) volta ao padrão sozinha. Cor nunca vira CSS
 * sem passar por aqui.
 */
export function resolveProfileTheme(raw?: Partial<ProfileTheme> | null): ProfileTheme {
  const border = PROFILE_BORDERS.find((b) => b.id === raw?.border)
  const borderColors = border ? cleanColors(raw?.border_colors, border.colors) : null
  const background = PROFILE_BACKGROUNDS.find((b) => b.id === raw?.background)
  const backgroundColors = background
    ? cleanColors(raw?.background_colors, background.colors)
    : null
  const effect = PROFILE_EFFECTS.find((e) => e.id === raw?.effect)
  return {
    border: border && borderColors ? border.id : 'none',
    border_colors: border && borderColors ? borderColors : [],
    background: background && backgroundColors ? background.id : 'default',
    background_colors: background && backgroundColors ? backgroundColors : [],
    effect: effect?.id ?? 'none',
    ...resolveExtras(raw)
  }
}

/** Troca a borda mantendo as cores que servem e completando as que faltam. */
export function withBorder(theme: ProfileTheme, id: string): ProfileTheme {
  const def = PROFILE_BORDERS.find((b) => b.id === id)
  if (!def) return theme
  const colors = [...theme.border_colors, ...BORDER_FALLBACK.slice(theme.border_colors.length)]
  return { ...theme, border: id, border_colors: colors.slice(0, def.colors) }
}

/** Troca o fundo mantendo as cores que servem e completando as que faltam. */
export function withBackground(theme: ProfileTheme, id: string): ProfileTheme {
  const def = PROFILE_BACKGROUNDS.find((b) => b.id === id)
  if (!def) return theme
  const colors = [
    ...theme.background_colors,
    ...BACKGROUND_FALLBACK.slice(theme.background_colors.length)
  ]
  return { ...theme, background: id, background_colors: colors.slice(0, def.colors) }
}

/** Mesmo tema (compara já resolvido). */
export function sameTheme(a: ProfileTheme, b: ProfileTheme): boolean {
  return JSON.stringify(resolveProfileTheme(a)) === JSON.stringify(resolveProfileTheme(b))
}
