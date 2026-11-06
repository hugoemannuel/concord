/**
 * Faixas de nível: a cada 10 níveis muda a cor (e a animação de subir fica
 * mais intensa). Do 100 em diante é "Lendário", com gradiente animado.
 */
export interface LevelTier {
  name: string
  /** Cor principal (badge, halo, faíscas). */
  color: string
  /** Segunda cor do gradiente do badge. */
  accent: string
}

const TIERS: LevelTier[] = [
  { name: 'Bronze', color: '#cd7f32', accent: '#8a4b16' },
  { name: 'Prata', color: '#c9d1dc', accent: '#7d8896' },
  { name: 'Ouro', color: '#f5c542', accent: '#b8860b' },
  { name: 'Esmeralda', color: '#34d399', accent: '#047857' },
  { name: 'Safira', color: '#60a5fa', accent: '#1d4ed8' },
  { name: 'Ametista', color: '#c084fc', accent: '#7e22ce' },
  { name: 'Rubi', color: '#f87171', accent: '#b91c1c' },
  { name: 'Diamante', color: '#67e8f9', accent: '#0e7490' },
  { name: 'Obsidiana', color: '#a5b4fc', accent: '#312e81' },
  { name: 'Celestial', color: '#fde68a', accent: '#db2777' }
]

export const LEGENDARY_TIER: LevelTier = { name: 'Lendário', color: '#ffffff', accent: '#f472b6' }

export function levelTier(level: number): LevelTier {
  if (level >= 100) return LEGENDARY_TIER
  return TIERS[Math.max(0, Math.floor(level / 10))] ?? TIERS[0]
}

/** Arco-íris da faixa Lendária (badge, aurora, fogos). */
export const RAINBOW = ['#f472b6', '#facc15', '#34d399', '#60a5fa', '#c084fc']

/** Teto de partículas animadas numa celebração (avatar + janela + marco). */
export const MAX_PARTICLES = 120

/**
 * Força da subida de nível: 0 no nível 1, 1 no 100. Depois do 100 continua
 * subindo, cada vez mais devagar, e nunca chega a 1,25 (é o que segura os
 * tetos). Sobe a cada nível, então cada subida é um pouco maior que a outra.
 */
function levelPower(level: number): number {
  const l = Number.isFinite(level) ? Math.max(1, level) : level > 0 ? Infinity : 1
  if (l <= 100) return (l - 1) / 99
  if (l === Infinity) return 1.25
  return 1 + 0.25 * (1 - 100 / l)
}

/** Força do nível em que um efeito começa (ex.: confete a partir do 60). */
const powerAt = (level: number): number => (level - 1) / 99

/** a no p = 0, b no p = 1, e segue a reta depois do 1. */
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p

/** a na força `from`, b na `to` (seguindo a reta depois); 0 antes de `from`. */
const ramp = (p: number, from: number, to: number, a: number, b: number): number =>
  p < from ? 0 : a + ((b - a) * (p - from)) / (to - from)

const round = (value: number, digits = 0): number => {
  const k = 10 ** digits
  return Math.round(value * k) / k
}

/**
 * Escala contínua da subida de nível. Cresce um pouco a cada nível (não só
 * de 20 em 20) e depois do 100 continua crescendo devagar, com teto.
 */
export interface LevelIntensity {
  /** 0 no nível 1, 1 no 100, quase 1,25 lá no alto. */
  power: number
  /** Faíscas saindo do avatar. */
  sparks: number
  /** Partículas girando em volta do avatar (40+). */
  orbit: number
  /** Confete saindo da sua faixa (pouco no começo, muito no alto). */
  confetti: number
  /** Estrelas caindo na celebração lendária (100+). */
  stars: number
  /** Partículas da animação de marco (o quanto ela pode usar). */
  milestoneParticles: number
  /** Quanto a celebração fica na tela. */
  durationMs: number
  /** Tamanho do burst no avatar (o que os outros veem). */
  burstScale: number
  /** Até onde o confete e o marco se espalham, em px. */
  radius: number
  /** Força do brilho (0–1): sombras, halo, vinheta. */
  glow: number
  /** Tremida da sua faixa/overlay, em px (nunca o app inteiro). */
  shake: number
  /** Quantas cores as partículas usam (mais cores no alto). */
  colors: number
}

type NumericIntensity = { [K in keyof LevelIntensity]: number }

const fromPower = (p: number): LevelIntensity => ({
  power: p,
  sparks: Math.round(lerp(8, 24, p)),
  orbit: Math.round(ramp(p, powerAt(40), 1, 4, 10)),
  confetti: Math.round(lerp(6, 18, p)),
  stars: Math.round(ramp(p, 1, 1.25, 14, 20)),
  milestoneParticles: Math.round(lerp(40, 80, p)),
  durationMs: Math.round(lerp(3000, 5200, p)),
  burstScale: round(lerp(1, 1.7, p), 2),
  radius: Math.round(lerp(90, 280, p)),
  glow: round(lerp(0.3, 0.86, p), 3),
  shake: round(lerp(0, 4, p), 1),
  colors: Math.round(lerp(2, 6, p))
})

/** Valores no limite da força (1,25): nenhum nível passa disso. */
export const INTENSITY_CAPS: NumericIntensity = fromPower(1.25)

export function levelIntensity(level: number): LevelIntensity {
  return fromPower(levelPower(level))
}

/**
 * Cores das partículas: a da faixa, branco e a escura da faixa; quanto mais
 * alto o nível, mais cores (as faixas vizinhas, depois o arco-íris).
 */
export function levelPalette(level: number): string[] {
  const tier = levelTier(level)
  const index = TIERS.indexOf(tier)
  const pool =
    tier === LEGENDARY_TIER
      ? [...RAINBOW, tier.color, tier.accent, '#fde68a', '#67e8f9']
      : [
          tier.color,
          '#ffffff',
          tier.accent,
          TIERS[index + 1]?.color ?? RAINBOW[0],
          TIERS[index - 1]?.color ?? RAINBOW[1],
          ...RAINBOW
        ]
  const unique = Array.from(new Set(pool))
  return unique.slice(0, levelIntensity(level).colors)
}

/** Animação especial de cada marco (10, 20 … 100), no tema da faixa. */
export const MILESTONE_KINDS = [
  'coins',
  'shockwave',
  'vines',
  'ripple',
  'crystals',
  'fire',
  'prism',
  'blackhole',
  'constellation',
  'legendary'
] as const

export type MilestoneKind = (typeof MILESTONE_KINDS)[number]

const MILESTONE_INFO: Record<MilestoneKind, { title: string; durationMs: number }> = {
  coins: { title: 'Chuva de moedas', durationMs: 2800 },
  shockwave: { title: 'Onda dourada', durationMs: 2600 },
  vines: { title: 'Vinhas de esmeralda', durationMs: 3400 },
  ripple: { title: 'Maré de safira', durationMs: 3200 },
  crystals: { title: 'Cristais de ametista', durationMs: 3800 },
  fire: { title: 'Fogo de rubi', durationMs: 3200 },
  prism: { title: 'Prisma de diamante', durationMs: 3400 },
  blackhole: { title: 'Buraco negro', durationMs: 4000 },
  constellation: { title: 'Constelação', durationMs: 4000 },
  legendary: { title: 'Lendário', durationMs: 4500 }
}

export interface Milestone {
  /** O nível redondo (pode ser menor que o atual se pulou vários). */
  level: number
  kind: MilestoneKind
  tier: LevelTier
  title: string
  durationMs: number
}

/**
 * Marco cruzado nesta subida: o maior nível redondo entre `previous`
 * (exclusive) e `level`. Depois do 100 as animações voltam a girar no
 * arco-íris, e cada centena (200, 300…) é Lendária de novo.
 */
export function milestoneFor(level: number, previous = level - 1): Milestone | null {
  if (!Number.isFinite(level)) return null
  const round10 = Math.floor(level / 10) * 10
  if (round10 < 10 || round10 <= previous) return null
  const kind: MilestoneKind =
    round10 % 100 === 0 ? 'legendary' : MILESTONE_KINDS[((round10 / 10) % 10) - 1]
  return { level: round10, kind, tier: levelTier(round10), ...MILESTONE_INFO[kind] }
}

/** Próximo nível redondo depois de `level` (a prévia "próximo marco"). */
export function nextMilestone(level: number): number {
  return (Math.floor(Math.max(0, level) / 10) + 1) * 10
}

/** Sons da subida de nível (lib/sounds.ts). */
export type LevelChime = 'levelChime' | 'levelChimeRich' | 'levelFanfare'
export type LevelSound = LevelChime | `milestone-${MilestoneKind}`

/**
 * O que a animação de subir de nível mostra. Os campos de avatar valem para
 * todo mundo (lista de membros, tile da chamada); os de janela só para quem
 * subiu, então o que os outros veem fica sempre menor que a sua festa.
 */
export interface LevelUpEffects {
  tier: LevelTier
  /** Degrau da escada: 0 = 1–19, 1 = 20–39, … 4 = 80–99, 5 = 100+. */
  stage: number

  // Avatar
  sparks: number
  /** Nível redondo (10, 20…). */
  shockwave: boolean
  /** Raios de luz girando atrás do avatar. */
  rays: boolean
  /** Partículas girando em volta do avatar. */
  orbit: number
  /** Tamanho do burst no avatar (os outros veem crescer com o nível). */
  burstScale: number
  /** O tile da pessoa na chamada brilha na cor da faixa. */
  tileGlow: boolean
  /** O número do selo rola pelos níveis até o novo. */
  rollNumber: boolean

  // Janela de quem subiu
  /** Borda da faixa girando na cor da faixa. */
  bannerBorder: boolean
  /** Confete saindo da faixa. */
  confetti: number
  /** Pulso de vinheta na janela inteira. */
  vignette: boolean
  /** Emblema grande da faixa atrás do banner. */
  emblem: boolean
  /** Celebração em tela cheia (aurora, estrelas, coroa, "LENDÁRIO"). */
  legendary: boolean
  /** Estrelas caindo na celebração lendária. */
  stars: number
  /** "Nova faixa: <nome>!" quando entra numa faixa nova. */
  tierReveal: string | null
  /** Animação especial do marco cruzado (10, 20…), se houver. */
  milestone: Milestone | null
  /** Partículas que a animação do marco pode usar (0 sem marco). */
  milestoneParticles: number
  /** Jingle do marco ou chime do nível. */
  sound: LevelSound | null

  // Escala contínua (levelIntensity)
  /** Força do nível: 0 no 1, 1 no 100 (quase 1,25 lá no alto). */
  power: number
  /** Até onde o confete se espalha, em px. */
  radius: number
  /** Força do brilho (0–1). */
  glow: number
  /** Tremida da faixa/overlay, em px. */
  shake: number
  /** Cores das partículas. */
  colors: string[]
  /** Quanto a celebração fica na tela (banner incluso). */
  durationMs: number
}

const CHIMES: (LevelChime | null)[] = [
  null,
  null,
  'levelChime',
  'levelChime',
  'levelChimeRich',
  'levelFanfare'
]

/**
 * Animação de subir de nível. Os números (faíscas, duração, tamanho,
 * brilho, tremida, cores) crescem a cada nível (levelIntensity); efeitos
 * novos entram de 20 em 20 (raios, órbita, borda, confete, vinheta,
 * emblema, lendário) e cada marco de 10 tem a sua animação e jingle.
 * `previous` é o nível de antes (pode ter pulado vários).
 */
export function levelUpEffects(level: number, previous = level - 1): LevelUpEffects {
  const stage = level >= 100 ? 5 : Math.max(0, Math.floor(level / 20))
  const tier = levelTier(level)
  const intensity = levelIntensity(level)
  const milestone = milestoneFor(level, previous)

  // No marco a animação dele é o show: sem confete e sem a tela lendária.
  const confetti = milestone ? 0 : intensity.confetti
  const stars = milestone ? 0 : intensity.stars
  const others = intensity.sparks + intensity.orbit + confetti + stars
  const milestoneParticles = milestone
    ? Math.max(0, Math.min(intensity.milestoneParticles, MAX_PARTICLES - others))
    : 0

  return {
    tier,
    stage,
    sparks: intensity.sparks,
    shockwave: milestone !== null,
    rays: stage >= 1,
    orbit: intensity.orbit,
    burstScale: intensity.burstScale,
    tileGlow: stage >= 3,
    rollNumber: stage >= 1,
    bannerBorder: stage >= 2,
    confetti,
    vignette: stage >= 4,
    emblem: stage >= 4,
    legendary: stage === 5 && milestone === null,
    stars,
    tierReveal: level > 1 && levelTier(previous) !== tier ? tier.name : null,
    milestone,
    milestoneParticles,
    sound: milestone ? `milestone-${milestone.kind}` : CHIMES[stage],
    power: intensity.power,
    radius: intensity.radius,
    glow: intensity.glow,
    shake: intensity.shake,
    colors: levelPalette(level),
    durationMs: Math.max(intensity.durationMs, milestone ? milestone.durationMs + 600 : 0)
  }
}

/** Percentual do nível atual já cumprido (0–100). */
export function levelPercent(intoLevel: number, forNext: number): number {
  if (forNext <= 0) return 0
  return Math.min(100, Math.max(0, Math.floor((intoLevel / forNext) * 100)))
}

/** "45 min", "3 h 20 min", "12 h". */
export function formatVoiceTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`
}

/** Minutos de call que faltam para o próximo nível (10 XP por minuto). */
export const XP_PER_MINUTE = 10

export function minutesToNext(intoLevel: number, forNext: number): number {
  return Math.max(0, Math.ceil((forNext - intoLevel) / XP_PER_MINUTE))
}
