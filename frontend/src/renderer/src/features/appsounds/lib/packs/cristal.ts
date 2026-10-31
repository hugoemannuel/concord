import type { SoundPack } from './types'
import { bell, midi, seq } from './voices'

// Cristal: sinos de vidro agudos, com cauda longa e brilho inarmônico.

const ring = (d: number, v: number) => (f: number, at: number) => bell(f, at, d, v)

const G5 = midi(79)
const A5 = midi(81)
const C6 = midi(84)
const D6 = midi(86)
const E6 = midi(88)
const G6 = midi(91)
const Gs6 = midi(92)
const A6 = midi(93)
const B6 = midi(95)
const C7 = midi(96)
const D7 = midi(98)
const E7 = midi(100)
const A7 = midi(105)

export const cristal: SoundPack = {
  id: 'cristal',
  label: 'Cristal',
  description: 'Sinos de vidro agudos, com brilho e eco.',
  sounds: {
    message: seq(ring(0.6, 0.12), [E6, B6], 0.12),
    mention: seq(ring(0.55, 0.09), [E6, Gs6, B6], 0.1),
    ring: seq(ring(0.45, 0.09), [C7, G6, C7, G6, C7], 0.2),
    join: seq(ring(0.45, 0.12), [G6, D7], 0.12),
    leave: seq(ring(0.45, 0.12), [D7, G6], 0.12),
    userJoin: seq(ring(0.3, 0.1), [C6, E6, G6, C7], 0.12),
    userLeave: seq(ring(0.35, 0.12), [G6, C6], 0.12),
    mute: seq(ring(0.3, 0.12), [A6, E6], 0.1),
    unmute: seq(ring(0.3, 0.12), [E6, A6], 0.1),
    deafen: seq(ring(0.35, 0.12), [D6, A5], 0.12),
    undeafen: seq(ring(0.35, 0.12), [A5, D6], 0.12),
    liveStart: seq(ring(0.4, 0.08), [E6, G6, C7, E7], 0.08),
    liveEnd: seq(ring(0.4, 0.08), [E7, C7, G6, E6], 0.08),
    liveJoin: bell(A7, 0, 0.3, 0.1),
    lock: seq(ring(0.18, 0.14), [C6, G5], 0.1),
    unlock: seq(ring(0.18, 0.14), [G5, C6], 0.1),
    knock: seq(ring(0.18, 0.14), [G5, G5, C6], 0.18),
    update: seq(ring(0.5, 0.08), [E6, G6, B6, E7], 0.15)
  }
}
