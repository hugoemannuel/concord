// O que a pessoa escolhe num tema próprio (formato v2): as cores da v1, os
// degradês opcionais, as cores extras (realce, texto secundário, bordas), brilho,
// vidro e a forma (cantos, densidade, fonte). Tudo que a v1 não tinha tem um
// padrão que reproduz a v1. Puro. Ver docs/adr/0041-aparencia-v2.md.

export type FillField = 'accent' | 'background' | 'sidebar' | 'card'
export type GradientType = 'linear' | 'radial'

/** Degradê de um preenchimento: a cor base do campo + 1 ou 2 cores. */
export interface Gradient {
  type: GradientType
  /** Graus (0–360), só no linear; 0/360 = para cima. */
  angle: number
  /** As paradas depois da base (#rrggbb). */
  colors: string[]
}

export type Density = 'compact' | 'normal' | 'comfortable'
export type FontId = 'outfit' | 'system' | 'serif' | 'mono'

/** As cores e efeitos (o que o gerador de paleta lê). '' = automático/sem. */
export interface PaletteInput {
  accent: string
  background: string
  sidebar: string
  card: string
  text: string
  glow: string
  gradients: Partial<Record<FillField, Gradient>>
  /** Realce: links e item selecionado. */
  highlight: string
  textMuted: string
  border: string
  /** 0–100. */
  glowStrength: number
  /** Vidro dos painéis: 0 = opaco, 100 = o máximo de transparência. */
  glass: number
}

export interface ThemeShape {
  /** Cantos em % do padrão (0 = retos, 100 = padrão, 200 = bem redondos). */
  radius: number
  density: Density
  font: FontId
}

export type ThemeInput = PaletteInput & ThemeShape

/** As seis cores da v1. */
export type ColorsV1 = Pick<PaletteInput, 'accent' | 'background' | 'sidebar' | 'card' | 'text' | 'glow'>

export const FILL_FIELDS: FillField[] = ['accent', 'background', 'sidebar', 'card']
export const DENSITIES: Density[] = ['compact', 'normal', 'comfortable']
export const FONTS: FontId[] = ['outfit', 'system', 'serif', 'mono']
export const MAX_GRADIENT_COLORS = 2
export const RADIUS_MAX = 200
/** O vidro que a v1 punha junto com o brilho (os mesmos painéis translúcidos). */
export const V1_GLASS = 40

/** Completa um tema v1 (ou parcial) com os padrões que reproduzem a v1. */
export function withDefaults(colors: ColorsV1 & Partial<ThemeInput>): ThemeInput {
  return {
    gradients: {},
    highlight: '',
    textMuted: '',
    border: '',
    glowStrength: 100,
    glass: colors.glow ? V1_GLASS : 0,
    radius: 100,
    density: 'normal',
    font: 'outfit',
    ...colors
  }
}

/** Só os campos do tema (o rascunho do editor traz id, nome e afins junto). */
export function inputOf(t: ThemeInput): ThemeInput {
  const { accent, background, sidebar, card, text, glow, gradients, highlight, textMuted, border } = t
  const { glowStrength, glass, radius, density, font } = t
  return {
    accent,
    background,
    sidebar,
    card,
    text,
    glow,
    gradients,
    highlight,
    textMuted,
    border,
    glowStrength,
    glass,
    radius,
    density,
    font
  }
}

/** As paradas de um preenchimento: a base e, com degradê, as cores dele. */
export function fillStops(input: PaletteInput, field: FillField): string[] {
  const gradient = input.gradients[field]
  return gradient ? [input[field], ...gradient.colors] : [input[field]]
}
