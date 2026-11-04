import type { EffectParams } from './effects/types'

// Opções finas do tema do cartão (backend internal/profiletheme/extras.go):
// cor, quantidade e velocidade do efeito, animação e espessura da borda,
// ângulo do degradê e textura do fundo. Zero/vazio = padrão, então tema salvo
// antes delas (ou mandado por cliente antigo) continua igual.

export interface ProfileThemeExtras {
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
  // Ajustes do efeito (backend effect_look.go): o app ainda não os desenha nem edita, mas
  // guarda e devolve, para salvar o perfil aqui não apagar o que foi escolhido no desktop.
  effect_size: number
  effect_direction: string
  effect_opacity: number
  effect_palette: string
  effect_color2: string
  effect_area: string
  effect_glow: number
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
  effect_size: DEFAULT_LEVEL,
  effect_direction: 'default',
  effect_opacity: 100,
  effect_palette: 'single',
  effect_color2: '',
  effect_area: 'full',
  effect_glow: 0
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

const EFFECT_DIRECTIONS = [{ id: 'default' }, { id: 'up' }, { id: 'down' }, { id: 'left' }, { id: 'right' }]
const EFFECT_PALETTES = [{ id: 'single' }, { id: 'duo' }, { id: 'rainbow' }]
const EFFECT_AREAS = [{ id: 'full' }, { id: 'banner' }]

/** O brilho vale de 0 a 100 (0 = padrão); `level` só conhece de 1 em diante. */
function glowLevel(raw: unknown): number {
  return Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) <= 100 ? (raw as number) : 0
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
    effect_size: level(raw?.effect_size, 100, DEFAULT_LEVEL),
    effect_direction: pick(raw?.effect_direction, EFFECT_DIRECTIONS),
    effect_opacity: level(raw?.effect_opacity, 100, 100),
    effect_palette: pick(raw?.effect_palette, EFFECT_PALETTES),
    effect_color2: typeof raw?.effect_color2 === 'string' && COLOR.test(raw.effect_color2) ? raw.effect_color2.toLowerCase() : '',
    effect_area: pick(raw?.effect_area, EFFECT_AREAS),
    effect_glow: glowLevel(raw?.effect_glow)
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

/** Parâmetros do efeito a partir dos extras e da cor padrão dele. */
export function effectParams(extras: ProfileThemeExtras, defaultColor: string): EffectParams {
  return {
    density: densityFactor(extras.effect_density),
    speed: speedFactor(extras.effect_speed),
    color: extras.effect_color || defaultColor
  }
}
