import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CARD_BG,
  DEFAULT_PROFILE_THEME,
  PROFILE_BACKGROUNDS,
  PROFILE_BORDERS,
  PROFILE_EFFECTS,
  profileThemeLook,
  effectDef,
  resolveProfileTheme,
  withBackground,
  withBorder
} from './profileTheme'
import { PRIDE_PALETTE, prideGradient } from './profilePride'
import { DEFAULT_EXTRAS, PROFILE_BORDER_ANIMATIONS, PROFILE_TEXTURES } from './profileThemeExtras'
import { EFFECT_AREAS, EFFECT_DIRECTIONS, EFFECT_PALETTES } from './effectLook'

// Lê as listas e as contagens de cor do Go: mudou só de um lado, quebra aqui.
const goFile = (name: string): string =>
  readFileSync(
    fileURLToPath(
      new URL(`../../../../../../../backend/internal/profiletheme/${name}`, import.meta.url)
    ),
    'utf8'
  )
const goSrc = goFile('profiletheme.go') + goFile('extras.go') + goFile('effect_look.go')
function goList(name: string): string[] {
  const body = new RegExp(`var ${name} = \\[\\]string\\{([^}]*)\\}`).exec(goSrc)?.[1] ?? ''
  return Array.from(body.matchAll(/"([a-z0-9]+)"/g), (m) => m[1])
}
function goCounts(name: string): Record<string, number> {
  const body = new RegExp(`var ${name} = map\\[string\\]int\\{([^}]*)\\}`).exec(goSrc)?.[1] ?? ''
  return Object.fromEntries(
    Array.from(body.matchAll(/"([a-z0-9]+)":\s*(\d+)/g), (m) => [m[1], Number(m[2])])
  )
}

describe('paridade com o backend', () => {
  it('bordas, fundos e efeitos são os mesmos', () => {
    expect(PROFILE_BORDERS.map((b) => b.id)).toEqual(goList('Borders'))
    expect(PROFILE_BACKGROUNDS.map((b) => b.id)).toEqual(goList('Backgrounds'))
    expect(PROFILE_EFFECTS.map((e) => e.id)).toEqual(goList('Effects'))
    expect(PROFILE_BORDER_ANIMATIONS.map((a) => a.id)).toEqual(goList('BorderAnimations'))
    expect(PROFILE_TEXTURES.map((t) => t.id)).toEqual(goList('Textures'))
    expect(EFFECT_DIRECTIONS.map((d) => d.id)).toEqual(goList('EffectDirections'))
    expect(EFFECT_PALETTES.map((p) => p.id)).toEqual(goList('EffectPalettes'))
    expect(EFFECT_AREAS.map((a) => a.id)).toEqual(goList('EffectAreas'))
  })
  it('as contagens de cor são as mesmas', () => {
    expect(Object.fromEntries(PROFILE_BORDERS.map((b) => [b.id, b.colors]))).toEqual(
      goCounts('borderColors')
    )
    expect(Object.fromEntries(PROFILE_BACKGROUNDS.map((b) => [b.id, b.colors]))).toEqual(
      goCounts('backgroundColors')
    )
  })
})

describe('resolveProfileTheme', () => {
  it('ausente vira o padrão', () => {
    expect(resolveProfileTheme(undefined)).toEqual(DEFAULT_PROFILE_THEME)
    expect(resolveProfileTheme(null)).toEqual(DEFAULT_PROFILE_THEME)
  })
  it('mantém um tema válido (cores em minúsculas)', () => {
    expect(
      resolveProfileTheme({
        border: 'neon',
        border_colors: ['#00FFAA'],
        background: 'gradient',
        background_colors: ['#1E1B4B', '#0f172a'],
        effect: 'snow'
      })
    ).toEqual({
      border: 'neon',
      border_colors: ['#00ffaa'],
      background: 'gradient',
      background_colors: ['#1e1b4b', '#0f172a'],
      effect: 'snow',
      ...DEFAULT_EXTRAS
    })
  })
  it('tema salvo antes das opções novas: extras no padrão e o mesmo visual', () => {
    const old = {
      border: 'neon',
      border_colors: ['#ec4899'],
      background: 'gradient',
      background_colors: ['#fce7f3', '#f9a8d4'],
      effect: 'particles'
    }
    const t = resolveProfileTheme(old)
    expect(t).toEqual({ ...old, ...DEFAULT_EXTRAS })
    const look = profileThemeLook(t)
    expect(look.className).toBe('profile-frame pt-border-neon pt-ink-dark')
    expect(look.style).toMatchObject({
      '--pt-bg': 'linear-gradient(180deg, #fce7f3, #f9a8d4)',
      '--pt-bw': '2px'
    })
    expect(look.style).not.toHaveProperty('--pt-fxc')
  })
  it('efeitos novos valem', () => {
    for (const id of [
      'fire',
      'matrix',
      'glitch',
      'storm',
      'galaxy',
      'aurora',
      'hearts',
      'confetti',
      'synthwave',
      'rain'
    ]) {
      expect(resolveProfileTheme({ ...DEFAULT_PROFILE_THEME, effect: id }).effect).toBe(id)
    }
  })
  it('cada parte inválida cai no padrão sozinha', () => {
    const t = resolveProfileTheme({
      border: 'solid',
      border_colors: ['red;background:url(x)'],
      background: 'gradient',
      background_colors: ['#111111', '#222222'],
      effect: 'fogos'
    })
    expect(t.border).toBe('none')
    expect(t.border_colors).toEqual([])
    expect(t.background).toBe('gradient')
    expect(t.effect).toBe('none')
  })
  it('número errado de cores não vale', () => {
    expect(
      resolveProfileTheme({
        ...DEFAULT_PROFILE_THEME,
        background: 'gradient',
        background_colors: ['#111111']
      }).background
    ).toBe('default')
    expect(
      resolveProfileTheme({
        ...DEFAULT_PROFILE_THEME,
        border: 'rainbow',
        border_colors: ['#111111']
      }).border
    ).toBe('none')
  })
})

describe('withBorder / withBackground', () => {
  it('completa as cores que faltam e corta as que sobram', () => {
    const g = withBorder(DEFAULT_PROFILE_THEME, 'gradient')
    expect(g.border_colors).toHaveLength(2)
    const solid = withBorder(g, 'solid')
    expect(solid.border_colors).toEqual([g.border_colors[0]])
    expect(withBorder(solid, 'rainbow').border_colors).toEqual([])
    expect(withBackground(DEFAULT_PROFILE_THEME, 'gradient').background_colors).toHaveLength(2)
    expect(withBackground(DEFAULT_PROFILE_THEME, 'nope')).toBe(DEFAULT_PROFILE_THEME)
  })
})

describe('profileThemeLook com extras', () => {
  it('ângulo, espessura, animação, textura e cor do efeito', () => {
    const look = profileThemeLook({
      ...DEFAULT_PROFILE_THEME,
      border: 'gradient',
      border_colors: ['#111111', '#222222'],
      background: 'gradient',
      background_colors: ['#000000', '#333333'],
      effect: 'fire',
      effect_color: '#00ff00',
      effect_density: 100,
      border_animation: 'spin',
      border_width: 5,
      background_angle: 45,
      texture: 'dots'
    })
    expect(look.style).toMatchObject({
      '--pt-bg': 'linear-gradient(45deg, #000000, #333333)',
      '--pt-bw': '5px',
      '--pt-fxc': '#00ff00'
    })
    expect(look.className).toContain('pt-anim-spin')
    expect(look.className).toContain('pt-tex-dots')
    expect(look.fx).toMatchObject({ id: 'fire', kind: 'canvas', params: { color: '#00ff00' } })
    expect(look.fx.params.density).toBeGreaterThan(2)
  })
  it('sem borda não anima; efeito sem cor própria usa a padrão', () => {
    const look = profileThemeLook({
      ...DEFAULT_PROFILE_THEME,
      border_animation: 'pulse',
      effect: 'matrix'
    })
    expect(look.className).not.toContain('pt-anim')
    expect(look.fx.params).toEqual({ density: 1, speed: 1, color: '#22ff88' })
    expect(profileThemeLook({ ...DEFAULT_PROFILE_THEME, effect: 'confetti' }).fx.params.color).toBe(
      '#ffffff'
    )
  })
  it('effectDef: desconhecido vira Nenhum', () => {
    expect(effectDef('nope').id).toBe('none')
    expect(effectDef('glitch').color).toBeNull()
  })
})

describe('fundo pride', () => {
  const pride = { ...DEFAULT_PROFILE_THEME, background: 'pride' }
  it('não tem cor escolhível; cores soltas invalidam o fundo', () => {
    expect(resolveProfileTheme(pride).background).toBe('pride')
    expect(resolveProfileTheme({ ...pride, background_colors: ['#111111'] }).background).toBe(
      'default'
    )
    expect(withBackground(withBackground(DEFAULT_PROFILE_THEME, 'gradient'), 'pride')).toMatchObject(
      { background: 'pride', background_colors: [] }
    )
  })
  it('faixas horizontais por padrão, o ângulo vale, texto claro e paleta fixa', () => {
    const look = profileThemeLook(pride)
    expect(look.style).toMatchObject({ '--pt-bg': prideGradient(180) })
    expect(profileThemeLook({ ...pride, background_angle: 90 }).style).toMatchObject({
      '--pt-bg': prideGradient(90)
    })
    expect(look.palette).toEqual(PRIDE_PALETTE)
    expect(look.surface).toBe(PRIDE_PALETTE[0])
    expect(look.ink).toBe('light')
    expect(look.className).toContain('pt-ink-light')
  })
  it('outros fundos: a paleta são as cores escolhidas', () => {
    expect(profileThemeLook(DEFAULT_PROFILE_THEME).palette).toEqual([])
  })
})

describe('profileThemeLook', () => {
  it('padrão: fundo do app, sem classe de texto escuro', () => {
    const look = profileThemeLook(DEFAULT_PROFILE_THEME)
    expect(look.surface).toBe(CARD_BG)
    expect(look.ink).toBe('light')
    expect(look.className).toBe('profile-frame pt-border-none')
    expect(look.style).toMatchObject({ '--pt-bg': `linear-gradient(${CARD_BG}, ${CARD_BG})` })
  })
  it('degradê em pé com as duas cores e anel do avatar na de cima', () => {
    const look = profileThemeLook({
      ...DEFAULT_PROFILE_THEME,
      background: 'gradient',
      background_colors: ['#fce7f3', '#f9a8d4'],
      border: 'neon',
      border_colors: ['#ec4899']
    })
    expect(look.style).toMatchObject({
      '--pt-bg': 'linear-gradient(180deg, #fce7f3, #f9a8d4)',
      '--pt-b1': '#ec4899'
    })
    expect(look.surface).toBe('#fce7f3')
    expect(look.className).toContain('pt-border-neon')
    expect(look.className).toContain('pt-ink-dark')
  })
  it('fundo próprio escuro força o texto claro (vale em qualquer tema do app)', () => {
    const look = profileThemeLook({
      ...DEFAULT_PROFILE_THEME,
      background: 'solid',
      background_colors: ['#1e1b4b']
    })
    expect(look.ink).toBe('light')
    expect(look.className).toContain('pt-ink-light')
    expect(look.className).not.toContain('pt-ink-dark')
  })
})
