/**
 * Buff de XP de voz por pessoas na call. O backend manda só o percentual
 * (100 = sem buff); aqui ele vira o rank no estilo do ranking de estilo do
 * Devil May Cry (só letra e texto, nada de fonte/logo/arte do jogo) e as
 * flags do que a animação mostra: cada rank soma efeitos ao anterior.
 */
export type BoostStage = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface BoostRank {
  letter: 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS'
  text: string
  /** "x1.25" */
  label: string
  stage: BoostStage
  /** Cor principal da letra, brilho e faíscas. */
  color: string
  /** Contorno/sombra da letra. */
  accent: string
  /** Quanto o banner de ativação fica na tela. */
  durationMs: number
  /** Faíscas soltas pelo banner. */
  sparks: number
  /** Onda de choque (anel) atrás da letra. */
  ring: boolean
  /** Flash vermelho/dourado nas bordas da janela. */
  edgeFlash: boolean
  /** A janela inteira treme no slam. */
  quake: boolean
  /** Flash de tela cheia. */
  screenFlash: boolean
  /** Glitch periódico na letra. */
  glitch: boolean
  /** Aura pulsante no cabeçalho do canal de voz. */
  aura: boolean
  /** Tempo de uma volta do brilho que corre pela barra de XP (menor = mais rápido). */
  shineMs: number
  /** Brasas que sobem da barra de XP. */
  embers: number
}

/** Sem nenhum efeito: cada rank liga só o que soma ao anterior. */
const NO_FX = {
  sparks: 0,
  ring: false,
  edgeFlash: false,
  quake: false,
  screenFlash: false,
  glitch: false,
  aura: false,
  embers: 0
} as const

const RANKS: Record<BoostStage, Omit<BoostRank, 'label'>> = {
  1: {
    ...NO_FX,
    letter: 'D',
    text: 'Dope!',
    stage: 1,
    color: '#94a3b8',
    accent: '#334155',
    durationMs: 900,
    shineMs: 3200
  },
  2: {
    ...NO_FX,
    letter: 'C',
    text: 'Crazy!',
    stage: 2,
    color: '#60a5fa',
    accent: '#1e3a8a',
    durationMs: 1000,
    shineMs: 2800
  },
  3: {
    ...NO_FX,
    letter: 'B',
    text: 'Blast!',
    stage: 3,
    color: '#2dd4bf',
    accent: '#115e59',
    durationMs: 1100,
    shineMs: 2400
  },
  4: {
    ...NO_FX,
    letter: 'A',
    text: 'Alright!',
    stage: 4,
    color: '#ef4444',
    accent: '#7f1d1d',
    durationMs: 1200,
    shineMs: 2000
  },
  5: {
    ...NO_FX,
    letter: 'S',
    text: 'Sweet!',
    stage: 5,
    color: '#f87171',
    accent: '#b91c1c',
    durationMs: 1600,
    edgeFlash: true,
    shineMs: 1600
  },
  6: {
    ...NO_FX,
    letter: 'SS',
    text: 'Showtime!',
    stage: 6,
    color: '#fb923c',
    accent: '#b45309',
    durationMs: 2000,
    sparks: 12,
    ring: true,
    edgeFlash: true,
    shineMs: 1200,
    embers: 4
  },
  7: {
    ...NO_FX,
    letter: 'SSS',
    text: "Smokin' Sexy Style!",
    stage: 7,
    color: '#fde047',
    accent: '#b45309',
    durationMs: 2500,
    sparks: 22,
    ring: true,
    edgeFlash: true,
    quake: true,
    screenFlash: true,
    glitch: true,
    aura: true,
    shineMs: 800,
    embers: 7
  }
}

/** Percentual mínimo de cada rank, do maior para o menor. */
const THRESHOLDS: ReadonlyArray<readonly [number, BoostStage]> = [
  [400, 7],
  [300, 6],
  [250, 5],
  [200, 4],
  [175, 3],
  [150, 2],
  [125, 1]
]

export function boostLabel(percent: number): string {
  const multiplier = percent / 100
  return `x${Number.isInteger(multiplier) ? multiplier.toFixed(1) : multiplier}`
}

/** Rank do buff, ou null quando não há buff (menos de 125%). */
export function boostRank(percent: number): BoostRank | null {
  const hit = THRESHOLDS.find(([min]) => percent >= min)
  if (!hit) return null
  return { ...RANKS[hit[1]], label: boostLabel(percent) }
}

/** Call fictícia da prévia de dev (`__salinhaBoost`) quando você não está em call. */
export const PREVIEW_BOOST_CALL_ID = 'preview'

/**
 * O banner de ativação só toca para quem está na call do buff e não está
 * mutado/surdo (quem está pausado não ganha o buff, então não comemora).
 */
export function shouldPlayBoostBanner(
  paused: boolean,
  celebrationCallId: string,
  currentCallId: string | null
): boolean {
  if (paused) return false
  return celebrationCallId === PREVIEW_BOOST_CALL_ID || celebrationCallId === currentCallId
}

/** A celebração do store junto com o rank dela. */
export interface ActiveBoostBanner<T> {
  celebration: T
  rank: BoostRank
}

/**
 * A celebração guardada no store junto com o rank dela, ou null quando o
 * banner (e o som) não devem tocar para mim agora.
 */
export function pickBoostBanner<T extends { callId: string; percent: number }>(
  stored: T | null,
  paused: boolean,
  currentCallId: string | null
): ActiveBoostBanner<T> | null {
  if (!stored || !shouldPlayBoostBanner(paused, stored.callId, currentCallId)) return null
  const rank = boostRank(stored.percent)
  return rank ? { celebration: stored, rank } : null
}
