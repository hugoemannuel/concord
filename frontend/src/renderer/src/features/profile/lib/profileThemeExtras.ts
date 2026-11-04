import { DEFAULT_EFFECT_LOOK, resolveEffectLook, type ProfileEffectLook } from './effectLook'
import type { EffectParams } from './effects/types'

// Opções finas do tema do cartão (backend internal/profiletheme/extras.go):
// cor, quantidade e velocidade do efeito, animação e espessura da borda,
// ângulo do degradê e textura do fundo. Zero/vazio = padrão, então tema salvo
// antes delas (ou mandado por cliente antigo) continua igual. Os ajustes de como o
// efeito aparece ficam em effectLook.ts.

export interface ProfileThemeExtras extends ProfileEffectLook {
  /** '' = a cor de sempre do efeito. */
  effect_color: string
  /** 1–100 (50 = padrão). */
  effect_density: number
  /** 1–100 (50 = padrão). */
  effect_speed: number
  border_animation: string
  /** 1–6 px. */
  border_width: number
  /** 1–360 graus (360 = para cima; 180 = em pé, o de antes). */
  background_angle: number
  texture: string
}

export const DEFAULT_LEVEL = 50
export const DEFAULT_BORDER_WIDTH = 2
export const MAX_BORDER_WIDTH = 6
export const DEFAULT_ANGLE = 180

export const PROFILE_BORDER_ANIMATIONS = [
  { id: 'default', label: 'Padrão' },
  { id: 'static', label: 'Parada' },
  { id: 'pulse', label: 'Pulsar' },
  { id: 'spin', label: 'Girar' }
] as const

export const PROFILE_TEXTURES = [
  { id: 'none', label: 'Nenhuma' },
  { id: 'grain', label: 'Granulado' },
  { id: 'dots', label: 'Pontos' },
  { id: 'lines', label: 'Listras' },
  { id: 'grid', label: 'Grade' }
] as const

/** Direções do degradê (o ângulo é livre no backend; o editor oferece estas). */
export const GRADIENT_DIRECTIONS = [
  { angle: 360, label: 'Para cima' },
  { angle: 45, label: 'Para cima e à direita' },
  { angle: 90, label: 'Para a direita' },
  { angle: 135, label: 'Para baixo e à direita' },
  { angle: 180, label: 'Para baixo' },
  { angle: 225, label: 'Para baixo e à esquerda' },
  { angle: 270, label: 'Para a esquerda' },
  { angle: 315, label: 'Para cima e à esquerda' }
] as const

export const DEFAULT_EXTRAS: ProfileThemeExtras = {
  effect_color: '',
  effect_density: DEFAULT_LEVEL,
  effect_speed: DEFAULT_LEVEL,
  border_animation: 'default',
  border_width: DEFAULT_BORDER_WIDTH,
  background_angle: DEFAULT_ANGLE,
  texture: 'none',
  ...DEFAULT_EFFECT_LOOK
}

const COLOR = /^#[0-9a-f]{6}$/i

/** Inteiro em [1, max]; 0, ausente ou fora do intervalo vira o padrão. */
function level(raw: unknown, max: number, def: number): number {
  return Number.isInteger(raw) && (raw as number) >= 1 && (raw as number) <= max
    ? (raw as number)
    : def
}

function pick(raw: unknown, list: readonly { id: string }[]): string {
  return list.find((o) => o.id === raw)?.id ?? list[0].id
}

/** Extras seguros para desenhar: cada um inválido volta ao padrão sozinho. */
export function resolveExtras(raw?: Partial<ProfileThemeExtras> | null): ProfileThemeExtras {
  const color = raw?.effect_color
  return {
    effect_color: typeof color === 'string' && COLOR.test(color) ? color.toLowerCase() : '',
    effect_density: level(raw?.effect_density, 100, DEFAULT_LEVEL),
    effect_speed: level(raw?.effect_speed, 100, DEFAULT_LEVEL),
    border_animation: pick(raw?.border_animation, PROFILE_BORDER_ANIMATIONS),
    border_width: level(raw?.border_width, MAX_BORDER_WIDTH, DEFAULT_BORDER_WIDTH),
    background_angle: level(raw?.background_angle, 360, DEFAULT_ANGLE),
    texture: pick(raw?.texture, PROFILE_TEXTURES),
    ...resolveEffectLook(raw)
  }
}

/** Fator da quantidade (1–100 → ~0,38–2,7; 50 = 1). */
export function densityFactor(value: number): number {
  return 2 ** ((value - DEFAULT_LEVEL) / 35)
}

/** Fator da velocidade (1–100 → ~0,43–2,4; 50 = 1). */
export function speedFactor(value: number): number {
  return 2 ** ((value - DEFAULT_LEVEL) / 40)
}

/** Parâmetros do efeito (canvas ou CSS) a partir dos extras e da cor padrão dele. */
export function effectParams(extras: ProfileThemeExtras, defaultColor: string): EffectParams {
  return {
    density: densityFactor(extras.effect_density),
    speed: speedFactor(extras.effect_speed),
    color: extras.effect_color || defaultColor
  }
}

/** Variáveis CSS dos extras (assets/profileTheme.css). */
export function extrasVars(extras: ProfileThemeExtras): Record<string, string> {
  const vars: Record<string, string> = { '--pt-bw': `${extras.border_width}px` }
  if (extras.effect_color) vars['--pt-fxc'] = extras.effect_color
  return vars
}

/** Classes dos extras (só o que foge do padrão): textura e animação da borda. */
export function extrasClasses(extras: ProfileThemeExtras, border: string): string[] {
  const classes: string[] = []
  if (extras.texture !== 'none') classes.push(`pt-tex-${extras.texture}`)
  const animated = border !== 'none' && extras.border_animation !== 'default'
  if (animated) classes.push(`pt-anim-${extras.border_animation}`)
  return classes
}
