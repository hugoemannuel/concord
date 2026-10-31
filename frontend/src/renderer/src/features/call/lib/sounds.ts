// Efeitos sonoros sintetizados (WebAudio) — sem arquivos de áudio.

export interface Note {
  freq: number
  /** início, em segundos */
  at: number
  duration: number
  /** ganho no pico; sem valor, BASE_VOLUME */
  volume?: number
  /** Forma da onda (padrão 'sine'). */
  wave?: OscillatorType
  /** Glissando: a frequência desliza até este valor no fim da nota. */
  slide?: number
}

/** Volume de todos os sons, menos os que pedem outro. */
export const BASE_VOLUME = 0.12

/** Alguém entrando na call que estou: ~3× mais alto, para não passar batido. */
const USER_JOIN_VOLUME = 0.36

const tone = (freq: number, at: number, duration = 0.09, volume?: number): Note => ({
  freq,
  at,
  duration,
  ...(volume === undefined ? {} : { volume })
})

/** Nota no volume padrão que desliza de `freq` até `to` (sons de transmissão). */
const sweep = (freq: number, to: number, at: number, duration: number): Note => ({
  ...tone(freq, at, duration),
  slide: to
})

export const noteVolume = (note: Note): number => note.volume ?? BASE_VOLUME

/**
 * Nota dos sons de nível: `share` é a fração do BASE_VOLUME, mais baixa que
 * os sons de interface, para não passar das vozes.
 */
const soft = (
  freq: number,
  at: number,
  duration: number,
  share: number,
  wave: OscillatorType = 'sine'
): Note => ({ freq, at, duration, volume: BASE_VOLUME * share, wave })

/** Nota de nível com glissando de `freq` até `to`. */
const glide = (
  freq: number,
  to: number,
  at: number,
  duration: number,
  share: number,
  wave: OscillatorType = 'sine'
): Note => ({ ...soft(freq, at, duration, share, wave), slide: to })

/** Várias notas ao mesmo tempo (acorde). */
const chord = (
  freqs: number[],
  at: number,
  duration: number,
  share: number,
  wave: OscillatorType = 'sine'
): Note[] => freqs.map((f) => soft(f, at, duration, share, wave))

/** Notas em sequência, `step` segundos entre uma e outra. */
const run = (
  freqs: number[],
  at: number,
  step: number,
  duration: number,
  share: number,
  wave: OscillatorType = 'sine'
): Note[] => freqs.map((f, i) => soft(f, at + i * step, duration, share, wave))

// Notas (Hz).
const A2 = 110
const A3 = 220
const E4 = 329.63
const A4 = 440
const C5 = 523.25
const Cs5 = 554.37
const E5 = 659.25
const G5 = 783.99
const A5 = 880
const C6 = 1046.5
const Cs6 = 1108.73
const D6 = 1174.66
const E6 = 1318.51
const Fs6 = 1479.98
const G6 = 1567.98
const A6 = 1760
const Cs7 = 2217.46
const C7 = 2093
const D7 = 2349.32
const E7 = 2637.02
const G7 = 3135.96

/**
 * Jingles dos marcos (10, 20 … 100): um por animação, no clima dela. Todos
 * sintetizados, com volume abaixo das vozes (ver sounds.test.ts).
 */
const MILESTONE_JINGLES = {
  // 10, Prata: moedas tilintando, cascata de "plins" metálicos.
  'milestone-coins': [
    ...run([E7, G7], 0, 0.06, 0.14, 0.3, 'triangle'),
    ...run([D7, E7], 0.22, 0.06, 0.14, 0.3, 'triangle'),
    ...run([C7, D7], 0.42, 0.06, 0.14, 0.3, 'triangle'),
    ...run([G6, C7], 0.6, 0.05, 0.12, 0.3, 'triangle'),
    ...chord([C7, G7], 0.8, 0.6, 0.3, 'triangle')
  ],
  // 20, Ouro: baque grave da onda e um acorde dourado subindo.
  'milestone-shockwave': [
    glide(150, 50, 0, 0.5, 0.3),
    ...chord([C5, E5, G5], 0.1, 0.5, 0.15, 'triangle'),
    ...run([C6, E6, G6, C7], 0.6, 0.08, 0.16, 0.3),
    ...chord([C6, G6], 0.95, 0.6, 0.22, 'triangle')
  ],
  // 30, Esmeralda: corrida pentatônica tipo flauta e folhas tremulando.
  'milestone-vines': [
    ...run([G5, A5, C6, D6, E6, G6], 0, 0.09, 0.17, 0.3),
    ...run([D6, G6, D6, G6], 0.6, 0.07, 0.08, 0.25, 'triangle'),
    ...chord([G5, D6, G6], 1.0, 0.8, 0.2)
  ],
  // 40, Safira: duas gotas ("plink") e um arpejo de água descendo e voltando.
  'milestone-ripple': [
    glide(900, 1800, 0, 0.12, 0.4),
    glide(1200, 2400, 0.28, 0.12, 0.4),
    ...[E6, Cs6, A5, E5].flatMap((f, i) => [
      soft(f, 0.55 + i * 0.15, 0.28, 0.18),
      soft(f * 1.004, 0.55 + i * 0.15, 0.28, 0.18)
    ]),
    ...chord([A5, E6, A6], 1.3, 0.6, 0.2)
  ],
  // 50, Ametista: sinos de cristal e um acorde que brilha.
  'milestone-crystals': [
    ...run([Fs6, Cs7, A6, E7], 0, 0.18, 0.5, 0.18),
    ...chord([A5, E6, A6], 1.0, 1.0, 0.18),
    soft(E7, 1.2, 0.6, 0.08)
  ],
  // 60, Rubi: estrondo grave, power chord e subida de brasas.
  'milestone-fire': [
    glide(82, 55, 0, 0.6, 0.18, 'sawtooth'),
    ...chord([A3, E4], 0.1, 0.5, 0.12, 'square'),
    ...run([A4, Cs5, E5, A5], 0.55, 0.08, 0.1, 0.25, 'triangle'),
    ...chord([A5, E6], 0.9, 0.7, 0.22, 'triangle'),
    soft(A2, 0.9, 0.5, 0.15)
  ],
  // 70, Diamante: glissando de vidro subindo e acorde lídio claro.
  'milestone-prism': [
    ...run([C6, D6, E6, Fs6, G6, A6, C7, D7, E7], 0, 0.045, 0.08, 0.3),
    ...chord([D6, Fs6, A6, Cs7], 0.6, 1.0, 0.18)
  ],
  // 80, Obsidiana: tudo é sugado (glissando descendo), silêncio e explosão.
  'milestone-blackhole': [
    glide(700, 55, 0, 1.4, 0.35),
    glide(1050, 80, 0.1, 1.3, 0.2, 'triangle'),
    glide(90, 35, 1.55, 0.6, 0.45),
    ...chord([C5, G5, C6], 1.75, 0.8, 0.1, 'triangle')
  ],
  // 90, Celestial: celesta piscando como estrelas e acorde suave.
  'milestone-constellation': [
    ...run([E6, G6, C7, A6, D7, G6, E7, C7], 0, 0.15, 0.35, 0.25),
    ...chord([C6, E6, G6], 1.45, 1.0, 0.2),
    soft(G7, 1.6, 0.7, 0.1)
  ],
  // 100, Lendário: fanfarra "tã-tã-tã-tãããã" que sobe e acorde grande.
  'milestone-legendary': [
    ...run([G5, G5, G5], 0, 0.13, 0.1, 0.45, 'triangle'),
    soft(C6, 0.39, 0.4, 0.45, 'triangle'),
    soft(D6, 0.85, 0.12, 0.45, 'triangle'),
    soft(E6, 1.0, 0.5, 0.45, 'triangle'),
    ...chord([C5, E5, G5, C6], 1.55, 1.2, 0.17, 'triangle'),
    soft(E7, 1.7, 0.9, 0.1)
  ]
} satisfies Record<string, Note[]>

export const SOUNDS = {
  join: [tone(587, 0), tone(880, 0.1, 0.14)],
  leave: [tone(880, 0), tone(587, 0.1, 0.14)],
  // Três notas subindo (sem sobrepor, para a soma não passar de 0,36).
  userJoin: [
    tone(660, 0, 0.07, USER_JOIN_VOLUME),
    tone(880, 0.08, 0.08, USER_JOIN_VOLUME),
    tone(1109, 0.17, 0.12, USER_JOIN_VOLUME)
  ],
  userLeave: [tone(880, 0, 0.07), tone(660, 0.08, 0.1)],
  mute: [tone(520, 0, 0.06), tone(390, 0.07, 0.08)],
  unmute: [tone(390, 0, 0.06), tone(520, 0.07, 0.08)],
  deafen: [tone(440, 0, 0.07), tone(294, 0.08, 0.1)],
  undeafen: [tone(294, 0, 0.07), tone(440, 0.08, 0.1)],
  // Sala trancada/destrancada: "clique" descendo/subindo.
  lock: [tone(1047, 0, 0.05), tone(784, 0.06, 0.07)],
  unlock: [tone(784, 0, 0.05), tone(1047, 0.06, 0.07)],
  // Alguém batendo na porta da sala trancada: "toc-toc".
  knock: [tone(392, 0, 0.06), tone(392, 0.12, 0.06), tone(523, 0.26, 0.12)],
  // DM recebida: dois toques curtos subindo, mais graves que a menção.
  message: [tone(784, 0, 0.08), tone(1047, 0.09, 0.12)],
  mention: [tone(988, 0, 0.12), tone(1319, 0.13, 0.22)],
  // Chamada recebida (repete a cada 2 s enquanto toca): duas senoides juntas.
  ring: [tone(440, 0, 0.9, 0.08), tone(480, 0, 0.9, 0.08)],
  // Versão nova do app: três notas subindo, mais lentas que a menção.
  update: [tone(784, 0, 0.09), tone(988, 0.1, 0.09), tone(1319, 0.2, 0.2)],
  // Alguém abriu transmissão na call: varrida subindo e duas notas ("liga").
  liveStart: [sweep(440, 880, 0, 0.12), tone(1175, 0.13, 0.07), tone(1568, 0.21, 0.18)],
  // A transmissão acabou: o espelho do anterior, descendo ("desliga").
  liveEnd: [tone(1568, 0, 0.07), tone(1175, 0.08, 0.07), sweep(880, 440, 0.16, 0.16)],
  // Alguém começou a assistir a live que estou vendo: "blip" agudo e curto.
  liveJoin: [sweep(1200, 1800, 0, 0.07), tone(2093, 0.08, 0.09)],
  // Subir de nível (40+): arpejo curto subindo (dó-mi-sol).
  levelChime: [soft(1047, 0, 0.1, 0.38), soft(1319, 0.07, 0.1, 0.38), soft(1568, 0.14, 0.25, 0.38)],
  // 80+: arpejo mais longo terminando num acorde que soa um pouco.
  levelChimeRich: [
    soft(784, 0, 0.1, 0.3),
    soft(1047, 0.08, 0.1, 0.3),
    soft(1319, 0.16, 0.1, 0.3),
    soft(1568, 0.24, 0.1, 0.3),
    soft(1319, 0.34, 0.55, 0.25, 'triangle'),
    soft(2093, 0.34, 0.55, 0.25, 'triangle')
  ],
  // 100+ (Lendário): "tã-tã-tã-tãããã" e um acorde de dó maior aberto.
  levelFanfare: [
    soft(784, 0, 0.1, 0.45, 'triangle'),
    soft(784, 0.13, 0.1, 0.45, 'triangle'),
    soft(784, 0.26, 0.1, 0.45, 'triangle'),
    soft(1047, 0.39, 0.45, 0.45, 'triangle'),
    soft(1047, 0.9, 0.9, 0.2, 'triangle'),
    soft(1319, 0.9, 0.9, 0.2, 'triangle'),
    soft(1568, 0.9, 0.9, 0.2, 'triangle'),
    soft(2093, 1.05, 0.8, 0.18)
  ],
  ...MILESTONE_JINGLES
} satisfies Record<string, Note[]>

export type SoundName = keyof typeof SOUNDS

export const MILESTONE_SOUNDS = Object.keys(MILESTONE_JINGLES) as (keyof typeof MILESTONE_JINGLES)[]

export const LEVEL_SOUNDS: readonly SoundName[] = [
  'levelChime',
  'levelChimeRich',
  'levelFanfare',
  ...MILESTONE_SOUNDS
]

/** Maior soma de ganho entre as notas que tocam ao mesmo tempo. */
export function peakVolume(notes: Note[]): number {
  let peak = 0
  for (const { at: t } of notes) {
    const sum = notes
      .filter((n) => n.at <= t && t < n.at + n.duration)
      .reduce((acc, n) => acc + noteVolume(n), 0)
    peak = Math.max(peak, sum)
  }
  return Math.round(peak * 10000) / 10000
}

let ctx: AudioContext | null = null
let outputId = ''

/** Mesma saída de áudio escolhida nas configurações ('' = padrão). */
export function setSoundOutput(deviceId: string): void {
  outputId = deviceId
  const context = ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null
  void context?.setSinkId?.(deviceId).catch(() => {})
}

/** O som de nível tocando agora (para o próximo cortar este, sem sobrepor). */
let levelVoice: { group: GainNode; oscs: OscillatorNode[] } | null = null

/** Fade curto e para as notas do som de nível que ainda está tocando. */
function stopLevelVoice(now: number): void {
  if (!levelVoice) return
  const { group, oscs } = levelVoice
  levelVoice = null
  group.gain.cancelScheduledValues(now)
  group.gain.setValueAtTime(group.gain.value, now)
  group.gain.linearRampToValueAtTime(0, now + 0.04)
  for (const osc of oscs) {
    try {
      osc.stop(now + 0.05)
    } catch {
      // já parou
    }
  }
}

/** Contexto de áudio compartilhado (criado no primeiro som, na saída escolhida). */
export function soundContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!ctx) {
    ctx = new AudioContext()
    if (outputId) setSoundOutput(outputId)
  }
  void ctx.resume()
  return ctx
}

/**
 * Quem troca os sons (Configurações → Notificações, features/appsounds):
 * `play` devolve true quando já tocou (ou silenciou) o som; false = o padrão.
 */
export interface SoundHandler {
  play: (name: SoundName) => boolean
  stop: (name: SoundName) => void
}

let handler: SoundHandler | null = null

export function setSoundHandler(next: SoundHandler | null): void {
  handler = next
}

export function playSound(name: SoundName): void {
  if (handler?.play(name)) return
  playNotes(SOUNDS[name], { level: LEVEL_SOUNDS.includes(name) })
}

/** Corta o som que ainda está tocando (ex.: o toque da chamada ao atender). */
export function stopSound(name: SoundName): void {
  handler?.stop(name)
}

/**
 * Sons de nível passam por um grupo próprio: um novo corta o anterior, então
 * dois jingles nunca tocam juntos (e nunca somam acima do teto).
 */
function levelOutput(context: AudioContext): { group: GainNode; oscs: OscillatorNode[] } {
  stopLevelVoice(context.currentTime)
  const group = context.createGain()
  group.gain.value = 1
  group.connect(context.destination)
  levelVoice = { group, oscs: [] }
  return levelVoice
}

function scheduleNote(
  context: AudioContext,
  note: Note,
  start: number,
  out: AudioNode,
  gainScale: number
): OscillatorNode {
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = note.wave ?? 'sine'
  // ataque e queda curtos para não estalar
  const t0 = start + note.at
  const t1 = t0 + note.duration
  osc.frequency.setValueAtTime(note.freq, t0)
  if (note.slide) osc.frequency.exponentialRampToValueAtTime(note.slide, t1)
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(noteVolume(note) * gainScale, t0 + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t1)
  osc.connect(gain).connect(out)
  osc.start(t0)
  osc.stop(t1 + 0.02)
  return osc
}

/** Toca notas sintetizadas; `gain` multiplica o volume delas (1 = como estão). */
export function playNotes(notes: Note[], { level = false, gain = 1 } = {}): void {
  if (gain <= 0) return
  const context = soundContext()
  if (!context) return
  const voice = level ? levelOutput(context) : null
  const out = voice?.group ?? context.destination
  const start = context.currentTime + 0.01
  for (const note of notes) {
    const osc = scheduleNote(context, note, start, out, gain)
    voice?.oscs.push(osc)
  }
}

/**
 * `true` só na primeira vez de cada chave: efeitos que o StrictMode repete
 * em dev (ex.: o som de subir de nível) não tocam duas vezes.
 */
export function oncePerKey(): (key: number) => boolean {
  let last: number | undefined
  return (key) => {
    if (key === last) return false
    last = key
    return true
  }
}
