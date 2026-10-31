import type { Note } from '../../../call/lib/sounds'
import type { SoundPack } from './types'
import { midi, note, seq } from './voices'

// Fliperama: onda quadrada de videogame antigo, arpejos rápidos e "power-ups".
// A quadrada soa bem mais alta que a senoide: volumes baixos de propósito.

const V = 0.09
const sq = (f: number, at: number, d = 0.05, v = V): Note => note(f, at, d, v, 'square')
const blip = (d: number, v = V) => (f: number, at: number): Note[] => [sq(f, at, d, v)]
const zap = (from: number, to: number, at: number, d: number, v = V): Note => note(from, at, d, v, 'square', to)

const C5 = midi(72)
const E5 = midi(76)
const G5 = midi(79)
const C6 = midi(84)
const E6 = midi(88)
const G6 = midi(91)
const B5 = midi(83)
const C7 = midi(96)

export const fliperama: SoundPack = {
  id: 'fliperama',
  label: 'Fliperama',
  description: 'Bipes de videogame antigo, rápidos e bem marcados.',
  sounds: {
    message: [sq(C6, 0), sq(G6, 0.06, 0.08)],
    mention: seq(blip(0.04), [C6, E6, G6, C7], 0.045),
    ring: seq(blip(0.07), [B5, E6, B5, E6, B5, E6], 0.11),
    join: [zap(300, 900, 0, 0.1), sq(1200, 0.11, 0.06)],
    leave: [sq(1200, 0, 0.05), zap(900, 300, 0.06, 0.12)],
    userJoin: seq(blip(0.05, 0.15), [C5, E5, G5, C6], 0.055),
    userLeave: seq(blip(0.05), [G5, E5, C5], 0.06),
    mute: [sq(midi(69), 0, 0.04), sq(midi(64), 0.05, 0.05)],
    unmute: [sq(midi(64), 0, 0.04), sq(midi(69), 0.05, 0.05)],
    deafen: seq(blip(0.04), [C5, midi(69), midi(65)], 0.05),
    undeafen: seq(blip(0.04), [midi(65), midi(69), C5], 0.05),
    liveStart: seq(blip(0.03), [C5, midi(74), E5, midi(77), G5, midi(81), B5, C6], 0.035),
    liveEnd: seq(blip(0.03), [C6, midi(81), G5, E5, midi(74), C5], 0.04),
    liveJoin: [zap(1500, 2000, 0, 0.06)],
    lock: [sq(200, 0, 0.04, 0.09), sq(150, 0.05, 0.05, 0.09)],
    unlock: [sq(150, 0, 0.04, 0.09), sq(200, 0.05, 0.05, 0.09)],
    knock: [note(180, 0, 0.06, 0.2, 'triangle'), note(180, 0.13, 0.06, 0.2, 'triangle'), note(240, 0.27, 0.1, 0.2, 'triangle')],
    update: seq(blip(0.06), [C6, E6, G6, E6], 0.07).concat(sq(C7, 0.29, 0.14))
  }
}
