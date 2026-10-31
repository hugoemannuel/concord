import type { SoundPack } from './types'
import { midi, note, seq } from './voices'

// Discreto: senoides graves e curtas, bem baixinhas, para quem quer só um aviso.

const V = 0.08
const soft = (d = 0.18, v = V) => (f: number, at: number) => [note(f, at, d, v)]

const D4 = midi(62)
const E4 = midi(64)
const G4 = midi(67)
const A4 = midi(69)
const B4 = midi(71)
const C5 = midi(72)
const Cs5 = midi(73)
const E5 = midi(76)
const A5 = midi(81)

export const discreto: SoundPack = {
  id: 'discreto',
  label: 'Discreto',
  description: 'Toques graves e baixinhos, só para avisar.',
  sounds: {
    message: [note(A4, 0, 0.2, V)],
    mention: seq(soft(), [A4, E5], 0.12),
    ring: [note(A4, 0, 0.8, 0.06), note(Cs5, 0, 0.8, 0.06)],
    join: seq(soft(0.14), [E4, A4], 0.1),
    leave: seq(soft(0.14), [A4, E4], 0.1),
    userJoin: seq(soft(0.12, 0.16), [E4, A4, Cs5], 0.09),
    userLeave: seq(soft(0.12), [Cs5, A4], 0.09),
    mute: seq(soft(0.07), [E5, C5], 0.06),
    unmute: seq(soft(0.07), [C5, E5], 0.06),
    deafen: seq(soft(0.09), [Cs5, A4], 0.07),
    undeafen: seq(soft(0.09), [A4, Cs5], 0.07),
    liveStart: seq(soft(0.15), [A4, E5], 0.1),
    liveEnd: seq(soft(0.15), [E5, A4], 0.1),
    liveJoin: [note(A5, 0, 0.08, V)],
    lock: [note(G4, 0, 0.06, 0.1)],
    unlock: [note(B4, 0, 0.06, 0.1)],
    knock: seq(soft(0.08, 0.12), [D4, D4], 0.13),
    update: seq(soft(0.16), [A4, Cs5, E5], 0.11)
  }
}
