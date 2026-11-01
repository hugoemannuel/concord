import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColor } from '../../../shared/lib/contrast'
import { THEME_TOKENS, type ThemeToken } from '../../settings/lib/themes'
import { buildPalette, type PaletteInput } from './palette'

// As mesmas exigências de contraste dos temas prontos (settings/lib/themes.test.ts),
// agora sobre o que o gerador produz para qualquer escolha.

const AA_TEXT = 4.5
const AA_UI = 3

const SURFACES: ThemeToken[] = [
  'bg-tertiary',
  'bg-secondary',
  'bg-primary',
  'bg-members',
  'bg-surface',
  'bg-floating',
  'bg-modal',
  'bg-input'
]
const BODY_TEXT: ThemeToken[] = [
  'text-strong',
  'text-normal',
  'text-secondary',
  'text-muted',
  'text-faint',
  'interactive-normal',
  'interactive-hover'
]
const ACCENT_TEXT: ThemeToken[] = ['text-link', 'text-brand', 'text-positive', 'text-danger', 'text-warning']
const WHITE_TEXT_FILLS: ThemeToken[] = [
  'brand',
  'brand-hover',
  'green-strong',
  'green-strong-hover',
  'red-strong',
  'red-strong-hover'
]

const DISCORD_DARK: PaletteInput = {
  accent: '#5865f2',
  background: '#1a1a1e',
  sidebar: '#121214',
  card: '#242429',
  text: '#efeff1',
  glow: ''
}

/** Gerador pseudoaleatório fixo: os mesmos casos em toda rodada. */
function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function randomHex(next: () => number): string {
  return `#${Math.floor(next() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`
}

const rand = seeded(486)
const RANDOM: PaletteInput[] = Array.from({ length: 150 }, () => ({
  accent: randomHex(rand),
  background: randomHex(rand),
  sidebar: randomHex(rand),
  card: randomHex(rand),
  text: randomHex(rand),
  glow: rand() > 0.5 ? randomHex(rand) : ''
}))

const CASES: Array<[string, PaletteInput]> = [
  ['Discord Escuro', DISCORD_DARK],
  [
    'vermelho e branco (claro)',
    { accent: '#e11d48', background: '#ffffff', sidebar: '#fff1f2', card: '#ffffff', text: '#1f1f1f', glow: '' }
  ],
  [
    'vermelho e branco (escuro)',
    { accent: '#ef4444', background: '#2a0a0a', sidebar: '#7f1d1d', card: '#3b0d0d', text: '#ffffff', glow: '#dc2626' }
  ],
  [
    'destaque amarelo claro',
    { accent: '#fde047', background: '#101010', sidebar: '#0a0a0a', card: '#1c1c1c', text: '#fafafa', glow: '' }
  ],
  [
    'fundo cinza médio e texto cinza',
    { accent: '#808080', background: '#808080', sidebar: '#909090', card: '#707070', text: '#7a7a7a', glow: '' }
  ],
  [
    'branco puro em tudo',
    { accent: '#ffffff', background: '#ffffff', sidebar: '#ffffff', card: '#ffffff', text: '#ffffff', glow: '#ffffff' }
  ],
  [
    'preto puro em tudo',
    { accent: '#000000', background: '#000000', sidebar: '#000000', card: '#000000', text: '#000000', glow: '' }
  ],
  ...RANDOM.map((input, i): [string, PaletteInput] => [`aleatório ${i}`, input])
]

describe.each(CASES)('paleta: %s', (_name, input) => {
  const { tokens } = buildPalette(input)
  const get = (t: ThemeToken): string => tokens[t]
  /** Fundo translúcido composto sobre --bg-app (como o teste dos temas prontos). */
  const solid = (t: ThemeToken): string => {
    const c = parseColor(get(t))!
    if (c.a >= 1) return get(t)
    const base = parseColor(get('bg-app'))!
    const m = (a: number, b: number): number => Math.round(a * c.a + b * (1 - c.a))
    return `rgb(${m(c.r, base.r)}, ${m(c.g, base.g)}, ${m(c.b, base.b)})`
  }

  it('cobre todos os tokens com valores válidos e --bg-app opaco', () => {
    for (const t of THEME_TOKENS) {
      expect(tokens[t], `--${t}`).toBeDefined()
      if (t !== 'decor-opacity') expect(parseColor(tokens[t]), `--${t}: ${tokens[t]}`).not.toBeNull()
    }
    expect(parseColor(get('bg-app'))!.a).toBe(1)
  })

  it('texto do corpo passa AA em todos os fundos', () => {
    for (const surface of SURFACES) {
      for (const text of BODY_TEXT) {
        const ratio = contrastRatio(get(text), solid(surface))
        expect(ratio, `--${text} em --${surface}`).toBeGreaterThanOrEqual(AA_TEXT)
      }
    }
  })

  it('link, marca e avisos passam AA nos painéis', () => {
    for (const surface of ['bg-primary', 'bg-secondary', 'bg-floating', 'bg-modal'] as ThemeToken[]) {
      for (const text of ACCENT_TEXT) {
        expect(contrastRatio(get(text), solid(surface)), `--${text} em --${surface}`).toBeGreaterThanOrEqual(
          AA_TEXT
        )
      }
    }
  })

  it('item em hover/selecionado continua AA', () => {
    for (const surface of ['bg-primary', 'bg-secondary', 'bg-floating'] as ThemeToken[]) {
      for (const state of ['bg-hover', 'bg-active', 'bg-selected'] as ThemeToken[]) {
        for (const text of ['text-normal', 'interactive-hover', 'interactive-active'] as ThemeToken[]) {
          const ratio = contrastRatio(get(text), get(state), solid(surface))
          expect(ratio, `--${text} em --${state} sobre --${surface}`).toBeGreaterThanOrEqual(AA_TEXT)
        }
      }
    }
  })

  it('texto branco nos botões coloridos passa AA', () => {
    for (const fill of WHITE_TEXT_FILLS) {
      expect(contrastRatio('#ffffff', get(fill)), `branco em --${fill}`).toBeGreaterThanOrEqual(AA_TEXT)
    }
  })

  it('indicadores de status se destacam do fundo (3:1)', () => {
    for (const color of ['green', 'red', 'yellow'] as ThemeToken[]) {
      for (const surface of ['bg-primary', 'bg-secondary'] as ThemeToken[]) {
        expect(contrastRatio(get(color), solid(surface)), `--${color} em --${surface}`).toBeGreaterThanOrEqual(AA_UI)
      }
    }
  })
})

describe('buildPalette', () => {
  it('aceita o rascunho do editor (com nome e outros campos junto)', () => {
    const draft = { ...DISCORD_DARK, id: 'x', name: 'Meu tema', isNew: true }
    expect(buildPalette(draft).tokens['bg-primary']).toBe('#1a1a1e')
  })

  it('fundo escuro vira tema escuro; fundo claro, claro', () => {
    expect(buildPalette(DISCORD_DARK).scheme).toBe('dark')
    expect(buildPalette({ ...DISCORD_DARK, background: '#ffffff', text: '#111111' }).scheme).toBe('light')
  })

  it('escolhas que já servem não são ajustadas e viram os tokens principais', () => {
    const { tokens, adjusted } = buildPalette(DISCORD_DARK)
    expect(adjusted).toEqual([])
    expect(tokens['bg-primary']).toBe('#1a1a1e')
    expect(tokens['bg-secondary']).toBe('#121214')
    expect(tokens['bg-surface']).toBe('#242429')
    expect(tokens['text-normal']).toBe('#efeff1')
    expect(tokens.brand).toBe('#5865f2')
    expect(tokens.fg).toBe('#ffffff')
    expect(tokens['decor-opacity']).toBe('0')
  })

  it('avisa o que precisou mudar para ficar legível', () => {
    const { adjusted } = buildPalette({ ...DISCORD_DARK, text: '#303030', accent: '#fde047', sidebar: '#eeeeee' })
    expect(adjusted).toEqual(expect.arrayContaining(['text', 'accent', 'sidebar']))
  })

  it('brilho liga o fundo animado e deixa os painéis translúcidos', () => {
    const { tokens } = buildPalette({ ...DISCORD_DARK, glow: '#dc2626' })
    expect(tokens['decor-opacity']).toBe('1')
    expect(parseColor(tokens['bg-primary'])!.a).toBeLessThan(1)
    expect(parseColor(tokens['bg-app'])!.a).toBe(1)
  })

  it('tema claro usa véus pretos', () => {
    const { tokens } = buildPalette({ ...DISCORD_DARK, background: '#ffffff', sidebar: '#f5f5f5', card: '#ffffff', text: '#1f1f1f' })
    expect(tokens.fg).toBe('#000000')
  })
})
