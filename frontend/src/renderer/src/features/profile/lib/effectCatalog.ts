// Catálogo dos efeitos do perfil e do fundo do app: id, rótulo, como é desenhado,
// em que grupo aparece no editor e que opções fazem sentido para cada um.
import type { Flow } from './effects/view'

export type EffectGroupId = 'basic' | 'nature' | 'weather' | 'space' | 'party' | 'retro'

export interface EffectDef {
  id: string
  label: string
  kind: 'none' | 'css' | 'canvas'
  /** A cor de sempre do efeito; null = paleta própria, sem cor para escolher. */
  color: string | null
  group: EffectGroupId
  /** O sentido em que a cena anda; null = não anda para lado nenhum. */
  flow: Flow | null
  /** As direções oferecidas; [] = o efeito não tem Direção. */
  directions: readonly Flow[]
  size: boolean
  palette: boolean
  glow: boolean
}

const ALL_WAYS: readonly Flow[] = ['up', 'down', 'left', 'right']
const SIDEWAYS: readonly Flow[] = ['left', 'right']
const VERTICAL: readonly Flow[] = ['up', 'down']

function fx(
  id: string,
  label: string,
  kind: EffectDef['kind'],
  color: string | null,
  group: EffectGroupId,
  tune: Partial<EffectDef> = {}
): EffectDef {
  return {
    id,
    label,
    kind,
    color,
    group,
    flow: null,
    directions: [],
    size: true,
    palette: color !== null,
    glow: true,
    ...tune
  }
}

/**
 * Os efeitos, na ordem do backend (internal/profiletheme/profiletheme.go). Os
 * três primeiros depois de "Nenhum" são CSS (profileParticles.ts), os outros
 * canvas (lib/effects/).
 */
export const PROFILE_EFFECTS: readonly EffectDef[] = [
  fx('none', 'Nenhum', 'none', null, 'basic', { size: false, glow: false }),
  fx('particles', 'Partículas', 'css', '#c4b5fd', 'basic'),
  fx('sparkles', 'Brilhos', 'css', '#ffd84d', 'basic'),
  fx('snow', 'Neve', 'css', '#ffffff', 'weather'),
  fx('fire', 'Fogo', 'canvas', '#ff7a1a', 'nature'),
  fx('matrix', 'Matrix', 'canvas', '#22ff88', 'retro'),
  fx('glitch', 'Glitch', 'canvas', null, 'retro', { size: false, glow: false }),
  fx('storm', 'Tempestade', 'canvas', '#9ecbff', 'weather', { size: false }),
  fx('galaxy', 'Galáxia', 'canvas', '#a78bfa', 'space'),
  fx('aurora', 'Aurora', 'canvas', '#34d399', 'nature', { size: false }),
  fx('hearts', 'Corações', 'canvas', '#ff4d8d', 'party'),
  fx('confetti', 'Confete', 'canvas', null, 'party', {
    flow: 'down',
    directions: ALL_WAYS,
    glow: false
  }),
  fx('synthwave', 'Synthwave', 'canvas', '#ff2bd6', 'retro', { size: false }),
  fx('rain', 'Chuva', 'canvas', '#7cc4ff', 'weather', { flow: 'down', directions: ALL_WAYS }),
  fx('fireflies', 'Vaga-lumes', 'canvas', '#d9f99d', 'nature'),
  fx('sakura', 'Sakura', 'canvas', '#f9a8d4', 'nature', { flow: 'down', directions: ALL_WAYS }),
  fx('leaves', 'Folhas', 'canvas', '#ea8a1f', 'nature', { flow: 'down', directions: ALL_WAYS }),
  fx('bubbles', 'Bolhas', 'canvas', '#7dd3fc', 'nature', { flow: 'up', directions: ALL_WAYS }),
  fx('ocean', 'Ondas', 'canvas', '#38bdf8', 'nature'),
  fx('meteors', 'Estrelas cadentes', 'canvas', '#e0f2fe', 'space', {
    flow: 'left',
    directions: SIDEWAYS
  }),
  fx('fog', 'Névoa', 'canvas', '#cbd5e1', 'weather', {
    flow: 'right',
    directions: SIDEWAYS,
    size: false,
    glow: false
  }),
  fx('sunbeams', 'Raios de luz', 'canvas', '#fde68a', 'weather', { size: false }),
  fx('lava', 'Lava', 'canvas', '#ff5a1f', 'nature'),
  fx('money', 'Dinheiro', 'canvas', '#4ade80', 'party', {
    flow: 'down',
    // Sem "para cima": a meia-volta é espelho, e o cifrão sairia invertido.
    directions: ['down', 'left', 'right'],
    palette: false,
    glow: false
  }),
  fx('clouds', 'Nuvens', 'canvas', '#ffffff', 'weather', {
    flow: 'right',
    directions: SIDEWAYS,
    glow: false
  }),
  fx('hexagons', 'Hexágonos', 'canvas', '#22d3ee', 'retro'),
  fx('pixels', 'Pixels', 'canvas', '#4ade80', 'retro', { flow: 'down', directions: VERTICAL }),
  fx('bunting', 'Bandeirinhas', 'canvas', null, 'party', { glow: false }),
  fx('fireworks', 'Fogos', 'canvas', null, 'party')
]

/** Definição do efeito (desconhecido = "Nenhum"). */
export function effectDef(id: string): EffectDef {
  return PROFILE_EFFECTS.find((e) => e.id === id) ?? PROFILE_EFFECTS[0]
}

const GROUP_LABELS: readonly { id: EffectGroupId; label: string }[] = [
  { id: 'basic', label: 'Básicos' },
  { id: 'nature', label: 'Natureza' },
  { id: 'weather', label: 'Clima' },
  { id: 'space', label: 'Espaço' },
  { id: 'party', label: 'Festa' },
  { id: 'retro', label: 'Retrô' }
]

/** Os efeitos por grupo, na ordem em que o editor mostra. */
export const EFFECT_GROUPS = GROUP_LABELS.map((g) => ({
  ...g,
  effects: PROFILE_EFFECTS.filter((e) => e.group === g.id)
}))
