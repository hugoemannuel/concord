import type { Note } from '../../../call/lib/sounds'
import type { SoundPack } from './types'
import { note } from './voices'

// Espacial: varreduras de ficção científica, lasers e "warp" (glissandos).

const sweep = (from: number, to: number, at: number, d: number, v = 0.16): Note =>
  note(from, at, d, v, 'sine', to)
/** Dente de serra é áspero e alto: só como camada, bem baixo. */
const saw = (from: number, to: number, at: number, d: number): Note => note(from, at, d, 0.05, 'sawtooth', to)

export const espacial: SoundPack = {
  id: 'espacial',
  label: 'Espacial',
  description: 'Varreduras e lasers de ficção científica.',
  sounds: {
    message: [sweep(600, 1200, 0, 0.12), sweep(1600, 1700, 0.13, 0.1)],
    mention: [sweep(800, 1600, 0, 0.12), sweep(1000, 2000, 0.14, 0.14)],
    ring: [700, 1000, 700, 1000, 700, 1000].map((f, i) => sweep(f, f === 700 ? 1000 : 700, i * 0.15, 0.15, 0.12)),
    join: [saw(200, 800, 0, 0.25), sweep(800, 1600, 0, 0.25, 0.12)],
    leave: [sweep(1600, 800, 0, 0.25, 0.12), saw(800, 200, 0, 0.25)],
    userJoin: [sweep(400, 1600, 0, 0.3, 0.32)],
    userLeave: [sweep(1200, 400, 0, 0.25)],
    mute: [sweep(900, 450, 0, 0.12)],
    unmute: [sweep(450, 900, 0, 0.12)],
    deafen: [sweep(700, 200, 0, 0.2)],
    undeafen: [sweep(200, 700, 0, 0.2)],
    liveStart: [saw(150, 1200, 0, 0.35), sweep(2400, 2500, 0.36, 0.15, 0.12)],
    liveEnd: [sweep(2500, 2400, 0, 0.12, 0.12), saw(1200, 150, 0.13, 0.35)],
    liveJoin: [sweep(2000, 3000, 0, 0.06, 0.12), sweep(2000, 3000, 0.08, 0.06, 0.12)],
    lock: [sweep(300, 150, 0, 0.08, 0.2), sweep(150, 140, 0.09, 0.05, 0.2)],
    unlock: [sweep(150, 300, 0, 0.08, 0.2), sweep(300, 310, 0.09, 0.05, 0.2)],
    knock: [sweep(120, 80, 0, 0.1, 0.35), sweep(120, 80, 0.15, 0.1, 0.35), sweep(160, 110, 0.3, 0.12, 0.35)],
    update: [sweep(500, 1000, 0, 0.1), sweep(750, 1500, 0.11, 0.1), sweep(1000, 2000, 0.22, 0.14)]
  }
}
