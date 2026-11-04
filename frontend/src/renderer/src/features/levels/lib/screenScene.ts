import {
  levelIntensity,
  levelUpEffects,
  MAX_PARTICLES,
  RAINBOW,
  type MilestoneKind
} from './levels'
import { PRIDE_COLORS } from './levelBadgeStyle'
import { JAGUAR_LEVEL, JAGUAR_TITLE_AT, jaguarScene, jaguarScreenScene } from './jaguarScene'
import { buildScene, DRAWS_NUMBER, IMPACT_MS, type SceneInput } from './milestoneScenes'
import { prideScene } from './prideScene'
import { rng, type Scene } from './sceneKit'

/** Nível com a cena do arco-íris do orgulho (decisão do dono). */
export const PRIDE_LEVEL = 24

export type ScreenSceneKind = MilestoneKind | 'pride' | 'jaguar'

/**
 * Cena em tela cheia da SUA subida (LevelUpMilestone): a de cada marco
 * (10, 20…) ou a especial do nível 24. Tudo o que o componente precisa,
 * já decidido aqui (o componente só desenha).
 */
export interface ScreenScene {
  kind: ScreenSceneKind
  /** Nível mostrado (o marco cruzado ou o 24). */
  level: number
  color: string
  accent: string
  /** Cores das partículas. */
  colors: string[]
  /** Partículas que a cena pode criar. */
  budget: number
  power: number
  durationMs: number
  /** Quando o número/título entra (ms). */
  titleAt: number
  /** Quando a cena "bate" e o overlay treme (ms). */
  impactMs: number
  /** Texto grande ("20", "LENDÁRIO", "24"). */
  numberText: string
  /** Faixa embaixo do número. */
  label: string
  /** Degradê do número grande. */
  gradient: string
  /** O degradê do número corre (brilho animado). */
  shine: boolean
  /** Coroa em cima (lendário). */
  crown: boolean
  /** A cena desenha o próprio número (o título em DOM só guarda o lugar). */
  drawsNumber: boolean
}

/** Quando o título entra em cada cena (ms): depois do "momento" dela. */
const TITLE_AT: Record<ScreenSceneKind, number> = {
  coins: 150,
  shockwave: 120,
  vines: 900,
  ripple: 520,
  crystals: 1500,
  fire: 150,
  prism: 700,
  blackhole: 1950,
  constellation: 2100,
  legendary: 650,
  pride: 900,
  jaguar: JAGUAR_TITLE_AT
}

const PRIDE_MS = 3400
const PRIDE_IMPACT_MS = 1300

function prideSceneFor(level: number, previous: number): ScreenScene {
  const fx = levelUpEffects(level, previous)
  const others = fx.sparks + fx.orbit + fx.confetti + fx.stars
  return {
    kind: 'pride',
    level,
    color: '#c084fc',
    accent: '#750787',
    colors: PRIDE_COLORS,
    budget: Math.max(0, Math.min(levelIntensity(level).milestoneParticles, MAX_PARTICLES - others)),
    power: fx.power,
    durationMs: PRIDE_MS,
    titleAt: TITLE_AT.pride,
    impactMs: PRIDE_IMPACT_MS,
    numberText: String(level),
    label: `Nível ${level}`,
    gradient: `linear-gradient(90deg, ${[...PRIDE_COLORS, PRIDE_COLORS[0]].join(', ')})`,
    shine: true,
    crown: false,
    drawsNumber: false
  }
}

/**
 * A cena da subida de `previous` para `level`, ou null se ela não tem cena
 * (subida comum). Chegar no 24 ganha do marco que tenha sido pulado junto.
 */
export function screenSceneFor(level: number, previous: number): ScreenScene | null {
  if (level === PRIDE_LEVEL && previous < PRIDE_LEVEL) return prideSceneFor(level, previous)
  if (level === JAGUAR_LEVEL && previous < JAGUAR_LEVEL) return jaguarScreenScene(level, previous)
  const fx = levelUpEffects(level, previous)
  const milestone = fx.milestone
  if (!milestone) return null
  const { kind, tier } = milestone
  const legendary = kind === 'legendary'
  return {
    kind,
    level: milestone.level,
    color: tier.color,
    accent: tier.accent,
    colors: fx.colors,
    budget: fx.milestoneParticles,
    power: fx.power,
    durationMs: milestone.durationMs,
    titleAt: TITLE_AT[kind],
    impactMs: IMPACT_MS[kind],
    numberText: legendary ? 'LENDÁRIO' : String(milestone.level),
    label: legendary ? `Nível ${milestone.level}` : `Marco ${milestone.level} · ${milestone.title}`,
    gradient: legendary
      ? `linear-gradient(90deg, ${RAINBOW.join(', ')})`
      : `linear-gradient(180deg, #ffffff 0%, ${tier.color} 45%, ${tier.accent} 100%)`,
    shine: false,
    crown: legendary,
    drawsNumber: DRAWS_NUMBER.has(kind)
  }
}

/** Monta o desenho da cena no canvas (marco ou a do 24). */
export function buildScreenScene(
  kind: ScreenSceneKind,
  input: SceneInput,
  ctx: CanvasRenderingContext2D
): Scene {
  if (kind === 'pride') return prideScene(input, rng(input.level * 7919 + 17))
  if (kind === 'jaguar') return jaguarScene(input, rng(input.level * 7919 + 17))
  return buildScene(kind, input, ctx)
}

export interface SceneLayout {
  w: number
  h: number
  /** Centro do número. */
  cx: number
  cy: number
  /** Tamanho do número (o mesmo no canvas e no título em DOM). */
  fontPx: number
}

/** Onde fica o número da cena numa tela `w`×`h` (do celular ao monitor largo). */
export function sceneLayout(w: number, h: number): SceneLayout {
  return { w, h, cx: w / 2, cy: h * 0.46, fontPx: Math.round(Math.min(w * 0.24, h * 0.32, 280)) }
}
