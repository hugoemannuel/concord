import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColor } from '../../../shared/lib/contrast'
import { THEME_TOKENS, type ThemeToken } from '../../settings/lib/themes'
import { flatten } from './colorMath'
import { buildPalette } from './palette'
import { withDefaults, type ColorsV1, type Gradient, type PaletteInput } from './themeInput'

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

const DISCORD_DARK: PaletteInput = withDefaults({
  accent: '#5865f2',
  background: '#1a1a1e',
  sidebar: '#121214',
  card: '#242429',
  text: '#efeff1',
  glow: ''
})

const v1 = (colors: ColorsV1): PaletteInput => withDefaults(colors)

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
const RANDOM: PaletteInput[] = Array.from({ length: 150 }, () =>
  v1({
    accent: randomHex(rand),
    background: randomHex(rand),
    sidebar: randomHex(rand),
    card: randomHex(rand),
    text: randomHex(rand),
    glow: rand() > 0.5 ? randomHex(rand) : ''
  })
)

const maybe = (next: () => number, make: () => string): string => (next() > 0.5 ? make() : '')

function randomGradient(next: () => number): Gradient | undefined {
  if (next() < 0.3) return undefined
  const colors = next() > 0.5 ? [randomHex(next)] : [randomHex(next), randomHex(next)]
  return { type: next() > 0.5 ? 'linear' : 'radial', angle: Math.floor(next() * 8) * 45, colors }
}

// v2: degradês, vidro, realce, texto secundário e bordas sorteados.
const rand2 = seeded(2041)
const RANDOM_V2: PaletteInput[] = Array.from({ length: 120 }, () => ({
  ...RANDOM[Math.floor(rand2() * RANDOM.length)],
  gradients: {
    accent: randomGradient(rand2),
    background: randomGradient(rand2),
    sidebar: randomGradient(rand2),
    card: randomGradient(rand2)
  },
  highlight: maybe(rand2, () => randomHex(rand2)),
  textMuted: maybe(rand2, () => randomHex(rand2)),
  border: maybe(rand2, () => randomHex(rand2)),
  glowStrength: Math.floor(rand2() * 101),
  glass: rand2() > 0.4 ? Math.floor(rand2() * 101) : 0
}))

const CASES: Array<[string, PaletteInput]> = [
  ['Discord Escuro', DISCORD_DARK],
  [
    'vermelho e branco (claro)',
    v1({ accent: '#e11d48', background: '#ffffff', sidebar: '#fff1f2', card: '#ffffff', text: '#1f1f1f', glow: '' })
  ],
  [
    'vermelho e branco (escuro)',
    v1({ accent: '#ef4444', background: '#2a0a0a', sidebar: '#7f1d1d', card: '#3b0d0d', text: '#ffffff', glow: '#dc2626' })
  ],
  [
    'destaque amarelo claro',
    v1({ accent: '#fde047', background: '#101010', sidebar: '#0a0a0a', card: '#1c1c1c', text: '#fafafa', glow: '' })
  ],
  [
    'fundo cinza médio e texto cinza',
    v1({ accent: '#808080', background: '#808080', sidebar: '#909090', card: '#707070', text: '#7a7a7a', glow: '' })
  ],
  [
    'branco puro em tudo',
    v1({ accent: '#ffffff', background: '#ffffff', sidebar: '#ffffff', card: '#ffffff', text: '#ffffff', glow: '#ffffff' })
  ],
  [
    'preto puro em tudo',
    v1({ accent: '#000000', background: '#000000', sidebar: '#000000', card: '#000000', text: '#000000', glow: '' })
  ],
  [
    'vermelho e branco com degradê e vidro',
    {
      ...v1({ accent: '#e11d48', background: '#ffffff', sidebar: '#fff1f2', card: '#ffffff', text: '#1f1f1f', glow: '' }),
      gradients: {
        accent: { type: 'linear', angle: 135, colors: ['#f43f5e', '#b91c1c'] },
        background: { type: 'linear', angle: 180, colors: ['#ffe4e6'] },
        sidebar: { type: 'radial', angle: 0, colors: ['#fecdd3', '#ffffff'] }
      },
      highlight: '#dc2626',
      glass: 60
    }
  ],
  ...RANDOM.map((input, i): [string, PaletteInput] => [`aleatório ${i}`, input]),
  ...RANDOM_V2.map((input, i): [string, PaletteInput] => [`aleatório v2 ${i}`, input])
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

  it('texto do corpo passa AA em cada parada dos degradês dos fundos', () => {
    const { fills } = buildPalette(input)
    for (const fill of [fills.primary, fills.secondary, fills.surface]) {
      for (const stop of fill.stops) {
        const bg = flatten(stop, get('bg-app'))
        for (const text of BODY_TEXT) {
          expect(contrastRatio(get(text), bg), `--${text} na parada ${stop}`).toBeGreaterThanOrEqual(AA_TEXT)
        }
      }
    }
  })

  it('texto branco passa AA em cada parada do destaque (e no hover)', () => {
    const { fills } = buildPalette(input)
    for (const stop of [...fills.brand.stops, ...fills.brandHover.stops]) {
      expect(contrastRatio('#ffffff', stop), `branco em ${stop}`).toBeGreaterThanOrEqual(AA_TEXT)
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
    const { tokens } = buildPalette(
      v1({ accent: '#5865f2', background: '#1a1a1e', sidebar: '#121214', card: '#242429', text: '#efeff1', glow: '#dc2626' })
    )
    expect(tokens['decor-opacity']).toBe('1')
    expect(parseColor(tokens['bg-primary'])!.a).toBeLessThan(1)
    expect(parseColor(tokens['bg-app'])!.a).toBe(1)
  })

  it('tema claro usa véus pretos', () => {
    const { tokens } = buildPalette({ ...DISCORD_DARK, background: '#ffffff', sidebar: '#f5f5f5', card: '#ffffff', text: '#1f1f1f' })
    expect(tokens.fg).toBe('#000000')
  })

  it('tema da v1 continua igual (sem degradê, sem vidro, sem extras)', () => {
    const p = buildPalette(DISCORD_DARK)
    expect(p.fills.primary.stops).toEqual(['#1a1a1e'])
    expect(p.fills.window).toBeNull()
    expect(p.opaque).toBeNull()
    expect(p.blur).toBe(0)
    expect(p.tokens['text-link']).toBe('#4d96ee')
  })

  it('degradê: as paradas viram o preenchimento, puxadas para a faixa do esquema', () => {
    const p = buildPalette({
      ...DISCORD_DARK,
      gradients: { background: { type: 'linear', angle: 90, colors: ['#ffffff'] } }
    })
    expect(p.fills.primary.stops[0]).toBe('#1a1a1e')
    expect(p.fills.primary.stops).toHaveLength(2)
    expect(p.fills.primary.stops[1]).not.toBe('#ffffff')
    expect(p.adjusted).toContain('background')
  })

  it('vidro: painéis translúcidos, janela com o fundo principal, desfoque e versão opaca', () => {
    const p = buildPalette({ ...DISCORD_DARK, glass: 100 })
    expect(parseColor(p.tokens['bg-secondary'])!.a).toBeLessThan(0.82)
    expect(p.fills.window?.stops).toEqual(['#1a1a1e'])
    expect(p.blur).toBe(20)
    expect(p.opaque?.tokens['bg-secondary']).toBe('#121214')
    expect(p.opaque?.secondary.stops).toEqual(['#121214'])
  })

  it('vidro com degradê: o degradê do fundo vai para a janela e o painel fica só com a cor', () => {
    const p = buildPalette({
      ...DISCORD_DARK,
      glass: 50,
      gradients: { background: { type: 'linear', angle: 90, colors: ['#0d1a2a'] } }
    })
    expect(p.fills.primary.stops).toHaveLength(1)
    expect(p.fills.window?.stops).toEqual(['#1a1a1e', '#0d1a2a'])
  })

  it('realce pinta os links e o item selecionado; texto secundário e bordas próprios', () => {
    const p = buildPalette({ ...DISCORD_DARK, highlight: '#f472b6', textMuted: '#c4b5fd', border: '#f472b6' })
    expect(p.tokens['text-link']).toBe('#f472b6')
    expect(p.tokens['bg-selected']).toMatch(/^rgba\(/)
    expect(p.tokens['text-secondary']).toBe('#c4b5fd')
    expect(p.tokens['border-normal']).toBe('rgba(244, 114, 182, 0.5)')
  })

  it('intensidade do brilho vira a opacidade do fundo animado', () => {
    expect(buildPalette({ ...DISCORD_DARK, glow: '#dc2626', glowStrength: 40 }).tokens['decor-opacity']).toBe('0.4')
  })
})
