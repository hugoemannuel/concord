import type { SoundPack } from './types'
import { mallet, midi, seq } from './voices'

// Marimba: baquetas de madeira, escala pentatônica, quente e redondo.

const V = 0.18
const tap = (d = 0.12, v = V) => (f: number, at: number) => mallet(f, at, d, v)

const G3 = midi(55)
const C4 = midi(60)
const E4 = midi(64)
const A4 = midi(69)
const C5 = midi(72)
const D5 = midi(74)
const E5 = midi(76)
const G5 = midi(79)
const A5 = midi(81)
const C6 = midi(84)
const E6 = midi(88)
const A6 = midi(93)

export const marimba: SoundPack = {
  id: 'marimba',
  label: 'Marimba',
  description: 'Baquetas de madeira, quentes e redondas.',
  sounds: {
    message: seq(tap(), [G5, C6], 0.1),
    mention: seq(tap(0.14, 0.16), [E5, G5, C6], 0.08),
    ring: seq(tap(0.11, 0.18), [C6, A5, C6, A5, G5, A5, C6], 0.12),
    join: seq(tap(), [C5, G5], 0.11),
    leave: seq(tap(), [G5, C5], 0.11),
    userJoin: seq(tap(0.075, 0.3), [C5, E5, G5, C6], 0.08),
    userLeave: seq(tap(), [G5, E5, C5], 0.09),
    mute: seq(tap(), [E5, C5], 0.08),
    unmute: seq(tap(), [C5, E5], 0.08),
    deafen: seq(tap(0.16), [A4, E4], 0.1),
    undeafen: seq(tap(0.16), [E4, A4], 0.1),
    liveStart: seq(tap(0.12, 0.16), [C5, D5, E5, G5, A5], 0.07),
    liveEnd: seq(tap(0.12, 0.16), [A5, G5, E5, D5, C5], 0.07),
    liveJoin: [...mallet(A6, 0, 0.12, 0.16), ...mallet(midi(100), 0.07, 0.15, 0.14)],
    lock: [...mallet(800, 0, 0.05, 0.22), ...mallet(600, 0.07, 0.06, 0.22)],
    unlock: [...mallet(600, 0, 0.05, 0.22), ...mallet(800, 0.07, 0.06, 0.22)],
    knock: seq(tap(0.12, 0.3), [G3, G3, C4], 0.15),
    update: seq(tap(0.16, 0.16), [C5, E5, G5, C6, E6], 0.09)
  }
}
