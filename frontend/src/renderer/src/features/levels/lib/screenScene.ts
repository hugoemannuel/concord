import {
  levelIntensity,
  levelUpEffects,
  MAX_PARTICLES,
  RAINBOW,
  type MilestoneKind
} from './levels'
import { PRIDE_COLORS } from './levelBadgeStyle'
import { buildScene, DRAWS_NUMBER, IMPACT_MS, type SceneInput } from './milestoneScenes'
import { prideScene } from './prideScene'
import { rng, type Scene } from './sceneKit'

/** Nível com a cena do arco-íris do orgulho (decisão do dono). */
export const PRIDE_LEVEL = 24

/** Cenas feitas para um nível só (decisão do dono), fora dos marcos. */
export type SpecialSceneKind = 'pride'
export type ScreenSceneKind = MilestoneKind | SpecialSceneKind

/**
 * Cena em tela cheia da SUA subida (LevelUpMilestone): a de cada marco
 * (10, 20…) ou a especial de um nível (hoje o 24). Tudo o que o componente
 * precisa, já decidido aqui (o componente só desenha).
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

/** Quando o título entra em cada cena de marco (ms): depois do "momento" dela. */
const TITLE_AT: Record<MilestoneKind, number> = {
  coins: 150,
  shockwave: 120,
  vines: 900,
  ripple: 520,
  crystals: 1500,
  fire: 150,
  prism: 700,
  blackhole: 1950,
  constellation: 2100,
  legendary: 650
}

/** O que muda de uma cena especial para outra; o resto do esqueleto é comum. */
interface SpecialDef {
  kind: SpecialSceneKind
  color: string
  accent: string
  colors: string[]
  durationMs: number
  titleAt: number
  impactMs: number
}

const SPECIAL_SCENES: Record<number, SpecialDef> = {
  [PRIDE_LEVEL]: {
    kind: 'pride',
    color: '#c084fc',
    accent: '#750787',
    colors: PRIDE_COLORS,
    durationMs: 3400,
    titleAt: 900,
    impactMs: 1300
  }
}

/** Montador de cada cena especial (recebe o contexto onde vai desenhar). */
const SPECIAL_BUILDERS: Record<
  SpecialSceneKind,
  (s: SceneInput, r: () => number, ctx: CanvasRenderingContext2D) => Scene
> = {
  pride: (s, r) => prideScene(s, r)
}

function specialSceneFor(def: SpecialDef, level: number, previous: number): ScreenScene {
  const fx = levelUpEffects(level, previous)
  const others = fx.sparks + fx.orbit + fx.confetti + fx.stars
  return {
    kind: def.kind,
    level,
    color: def.color,
    accent: def.accent,
    colors: def.colors,
    budget: Math.max(0, Math.min(levelIntensity(level).milestoneParticles, MAX_PARTICLES - others)),
    power: fx.power,
    durationMs: def.durationMs,
    titleAt: def.titleAt,
    impactMs: def.impactMs,
    numberText: String(level),
    label: `Nível ${level}`,
    gradient: `linear-gradient(90deg, ${[...def.colors, def.colors[0]].join(', ')})`,
    shine: true,
    crown: false,
    drawsNumber: false
  }
}

/**
 * A cena da subida de `previous` para `level`, ou null se ela não tem cena
 * (subida comum). Chegar num nível especial ganha do marco pulado junto.
 */
export function screenSceneFor(level: number, previous: number): ScreenScene | null {
  const special = SPECIAL_SCENES[level]
  if (special && previous < level) return specialSceneFor(special, level, previous)
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

/** Monta o desenho da cena no canvas (marco ou cena especial de um nível). */
export function buildScreenScene(
  kind: ScreenSceneKind,
  input: SceneInput,
  ctx: CanvasRenderingContext2D
): Scene {
  if (kind in SPECIAL_BUILDERS) {
    return SPECIAL_BUILDERS[kind as SpecialSceneKind](input, rng(input.level * 7919 + 17), ctx)
  }
  return buildScene(kind as MilestoneKind, input, ctx)
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
