import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { colorDistance } from '../../../shared/lib/colorDiff'
import { contrastRatio, parseColor } from '../../../shared/lib/contrast'
import {
  DEFAULT_THEME,
  parseThemeCss,
  parseThemePreference,
  resolveTheme,
  THEME_TOKENS,
  THEMES,
  type ThemeToken
} from './themes'

const css = readFileSync(join(__dirname, '../../../assets/theme.css'), 'utf8')
const parsed = parseThemeCss(css)

/** AA para texto comum (WCAG 1.4.3). */
const AA_TEXT = 4.5
/** Componentes de interface e indicadores (WCAG 1.4.11). */
const AA_UI = 3

/** Fundos onde o texto aparece; os translúcidos (AMOLED) são compostos sobre --bg-app. */
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
const ACCENT_TEXT: ThemeToken[] = [
  'text-link',
  'text-brand',
  'text-positive',
  'text-danger',
  'text-warning'
]
/** Botões com texto branco por cima. */
const WHITE_TEXT_FILLS: ThemeToken[] = [
  'brand',
  'brand-hover',
  'green-strong',
  'green-strong-hover',
  'red-strong',
  'red-strong-hover'
]

describe('lista de temas', () => {
  it('tem os 8 temas, Discord Escuro primeiro e como padrão', () => {
    expect(THEMES.map((t) => t.id)).toEqual([
      'discord-dark',
      'discord-light',
      'amoled',
      'midnight',
      'forest',
      'sunset',
      'neon',
      'high-contrast'
    ])
    expect(DEFAULT_THEME).toBe('discord-dark')
  })

  it('cada tema da lista existe no CSS e vice-versa', () => {
    expect(Object.keys(parsed).sort()).toEqual(THEMES.map((t) => t.id).sort())
  })

  it('o :root (sem data-theme) é o Discord Escuro', () => {
    expect(css).toMatch(/:root,\s*\[data-theme='discord-dark'\]\s*\{/)
  })
})

describe('preferência salva', () => {
  it('aceita tema conhecido e "system"', () => {
    expect(parseThemePreference('midnight')).toBe('midnight')
    expect(parseThemePreference('system')).toBe('system')
  })

  it('lixo, vazio ou tema que sumiu viram o padrão', () => {
    expect(parseThemePreference(null)).toBe(DEFAULT_THEME)
    expect(parseThemePreference('')).toBe(DEFAULT_THEME)
    expect(parseThemePreference('roxo-velho')).toBe(DEFAULT_THEME)
    expect(parseThemePreference('__proto__')).toBe(DEFAULT_THEME)
  })

  it('aceita tema próprio ("custom-<id>")', () => {
    expect(parseThemePreference('custom-abc123')).toBe('custom-abc123')
    expect(parseThemePreference('custom-')).toBe(DEFAULT_THEME)
    expect(parseThemePreference('custom-ABC')).toBe(DEFAULT_THEME)
  })

  it('tema próprio que não existe (apagado, ainda não carregou) vira o padrão', () => {
    expect(resolveTheme('custom-abc', true, () => true)).toBe('custom-abc')
    expect(resolveTheme('custom-abc', true, () => false)).toBe(DEFAULT_THEME)
    expect(resolveTheme('custom-abc', true)).toBe(DEFAULT_THEME)
  })

  it('seguir o sistema escolhe o Discord claro ou escuro', () => {
    expect(resolveTheme('system', true)).toBe('discord-dark')
    expect(resolveTheme('system', false)).toBe('discord-light')
    expect(resolveTheme('forest', false)).toBe('forest')
  })
})

describe('parseThemeCss', () => {
  it('lê tokens, ignora comentários e junta seletores', () => {
    const out = parseThemeCss(`
      /* --bg-primary: #f00; */
      :root, [data-theme='a'] { --bg-primary: #111; color-scheme: dark; }
      [data-theme='b'] { --bg-primary: rgba(1, 2, 3, 0.5); --x: 1 }
      @theme inline { --color-y: var(--bg-primary); }
    `)
    expect(out).toEqual({
      a: { 'bg-primary': '#111' },
      b: { 'bg-primary': 'rgba(1, 2, 3, 0.5)', x: '1' }
    })
  })
})

describe.each(THEMES.map((t) => [t.label, t.id] as const))('tema %s', (_label, id) => {
  const tokens = parsed[id] ?? {}
  const get = (token: ThemeToken): string => tokens[token]
  /** Fundo opaco: translúcido é composto sobre --bg-app. */
  const solid = (token: ThemeToken): string => {
    const c = parseColor(get(token))!
    if (c.a >= 1) return get(token)
    const base = parseColor(get('bg-app'))!
    const mix = (t: number, b: number): number => Math.round(t * c.a + b * (1 - c.a))
    return `rgb(${mix(c.r, base.r)}, ${mix(c.g, base.g)}, ${mix(c.b, base.b)})`
  }

  it('define todos os tokens, com cores válidas', () => {
    for (const token of THEME_TOKENS) {
      expect(tokens[token], `--${token}`).toBeDefined()
      if (token === 'decor-opacity') {
        expect(Number(tokens[token])).toBeGreaterThanOrEqual(0)
        expect(Number(tokens[token])).toBeLessThanOrEqual(1)
      } else {
        expect(parseColor(tokens[token]), `--${token}: ${tokens[token]}`).not.toBeNull()
      }
    }
    expect(parseColor(get('bg-app'))!.a, '--bg-app precisa ser opaco').toBe(1)
  })

  it.each(SURFACES)('texto em %s passa AA (4.5:1)', (surface) => {
    for (const text of BODY_TEXT) {
      const ratio = contrastRatio(get(text), solid(surface))
      expect(ratio, `--${text} em --${surface}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
        AA_TEXT
      )
    }
  })

  it.each(['bg-primary', 'bg-secondary', 'bg-floating', 'bg-modal'] as ThemeToken[])(
    'link, marca e avisos em %s passam AA',
    (surface) => {
      for (const text of ACCENT_TEXT) {
        const ratio = contrastRatio(get(text), solid(surface))
        expect(ratio, `--${text} em --${surface}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
          AA_TEXT
        )
      }
    }
  )

  it('item em hover/selecionado continua AA', () => {
    for (const surface of ['bg-primary', 'bg-secondary', 'bg-floating'] as ThemeToken[]) {
      for (const state of ['bg-hover', 'bg-active', 'bg-selected'] as ThemeToken[]) {
        for (const text of [
          'text-normal',
          'interactive-hover',
          'interactive-active'
        ] as ThemeToken[]) {
          const ratio = contrastRatio(get(text), get(state), solid(surface))
          expect(
            ratio,
            `--${text} em --${state} sobre --${surface}: ${ratio.toFixed(2)}`
          ).toBeGreaterThanOrEqual(AA_TEXT)
        }
      }
    }
  })

  it('texto branco nos botões coloridos passa AA', () => {
    for (const fill of WHITE_TEXT_FILLS) {
      const ratio = contrastRatio('#ffffff', get(fill))
      expect(ratio, `branco em --${fill}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA_TEXT)
    }
  })

  it('indicadores de status (verde, vermelho, amarelo) se destacam do fundo (3:1)', () => {
    for (const color of ['green', 'red', 'yellow'] as ThemeToken[]) {
      for (const surface of ['bg-primary', 'bg-secondary'] as ThemeToken[]) {
        const ratio = contrastRatio(get(color), solid(surface))
        expect(ratio, `--${color} em --${surface}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
          AA_UI
        )
      }
    }
  })
})

/**
 * Cores do Discord de verdade, medidas em pixels nos prints do cliente desktop
 * (moda de cada região; ver scripts/e2e-cores-discord.mjs). O Discord
 * Escuro precisa ficar a ΔE ≤ 2 de todas.
 */
const DISCORD_ESCURO_MEDIDO: Record<string, string> = {
  'bg-app': '#121214', // moldura da janela, barra de título
  'bg-tertiary': '#121214', // trilho de servidores
  'bg-secondary': '#121214', // lista de canais e DMs
  'bg-primary': '#1a1a1e', // chat
  'bg-members': '#222327', // painel de perfil / membros
  'bg-input': '#222327', // caixa de mensagem
  'bg-surface': '#202024', // painel do usuário embaixo (os cartões de modal são #242428)
  'bg-floating': '#252429', // menus e popovers
  'bg-modal': '#242429', // modais
  'bg-accent': '#323237', // botões e peças dentro de modais
  'text-strong': '#fbfbfb',
  'text-normal': '#efeff1',
  'text-secondary': '#abacb2',
  'text-muted': '#96979e',
  'interactive-normal': '#96979e',
  'interactive-active': '#efeff1',
  'text-link': '#4d96ee',
  'text-positive': '#5eb479',
  brand: '#5865f2',
  green: '#45a366',
  red: '#da3e44'
}
/** Itens de lista e divisórias são translúcidos: o que importa é o resultado sobre o fundo. */
const DISCORD_ESCURO_COMPOSTO: Array<[token: ThemeToken, over: ThemeToken, medido: string]> = [
  ['bg-hover', 'bg-secondary', '#222225'],
  ['bg-selected', 'bg-secondary', '#2c2c30'],
  ['border-subtle', 'bg-primary', '#29292d']
]

describe('Discord Escuro tem as cores do Discord', () => {
  const dark = parsed['discord-dark'] ?? {}

  it.each(Object.entries(DISCORD_ESCURO_MEDIDO))('%s fica a ΔE ≤ 2 de %s', (token, medido) => {
    const delta = colorDistance(dark[token], medido)
    expect(
      delta,
      `--${token}: ${dark[token]} vs ${medido} (ΔE ${delta.toFixed(2)})`
    ).toBeLessThanOrEqual(2)
  })

  it.each(DISCORD_ESCURO_COMPOSTO)('%s sobre %s fica a ΔE ≤ 2 de %s', (token, over, medido) => {
    const delta = colorDistance(dark[token], medido, dark[over])
    expect(delta, `--${token} sobre --${over} (ΔE ${delta.toFixed(2)})`).toBeLessThanOrEqual(2)
  })

  it('texto apagado (horário, rótulo) só se afasta do Discord o necessário para passar AA', () => {
    // O #81828a do Discord dá 4,0:1 nos cartões e modais; o menor cinza que passa em todos é este.
    const delta = colorDistance(dark['text-faint'], '#81828a')
    expect(delta).toBeLessThanOrEqual(3.5)
    expect(contrastRatio('#81828a', dark['bg-surface'])).toBeLessThan(4.5)
  })
})

describe('.on-media (texto por cima de vídeo/imagem)', () => {
  const body = /\.on-media\s*\{([^}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? ''
  const tokens = Object.fromEntries(
    [...body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])
  )

  it('texto passa AA no véu dos chips (bg-black/60) mesmo sobre imagem branca', () => {
    for (const token of [
      'text-strong',
      'text-normal',
      'text-secondary',
      'text-muted',
      'text-faint'
    ]) {
      expect(tokens[token], `--${token}`).toBeDefined()
      const ratio = contrastRatio(tokens[token], 'rgba(0, 0, 0, 0.6)', '#ffffff')
      expect(ratio, `--${token}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA_TEXT)
    }
  })
})
