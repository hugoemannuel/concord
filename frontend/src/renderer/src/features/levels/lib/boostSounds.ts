import {
  type Note,
  chord,
  glide,
  oncePerKey,
  playNotes,
  run,
  soft
} from '../../call/lib/sounds'
import type { BoostStage } from './boost'

/**
 * Stingers do buff de XP, um por rank (D a SSS), todos sintetizados e em lá
 * maior. Cada rank soma uma camada ao anterior: tics, arpejo, impacto grave,
 * power chord, riff, acorde aberto e, no SSS, impacto duplo e cintilar final.
 * Duram menos que o banner do rank e ficam abaixo das vozes (ver
 * boostSounds.test.ts).
 */

// Notas (Hz).
const A2 = 110
const A3 = 220
const E4 = 329.63
const A4 = 440
const Cs5 = 554.37
const E5 = 659.25
const A5 = 880
const Cs6 = 1108.73
const E6 = 1318.51
const A6 = 1760
const E7 = 2637.02

export const BOOST_SOUNDS: Record<BoostStage, Note[]> = {
  // D: dois "tics" subindo.
  1: [...run([A4, Cs5], 0, 0.1, 0.14, 0.35, 'triangle')],
  // C: três notas subindo.
  2: [...run([A4, Cs5], 0, 0.1, 0.14, 0.3, 'triangle'), soft(E5, 0.2, 0.2, 0.35, 'triangle')],
  // B: arpejo de quatro notas e um acorde curto.
  3: [
    ...run([A4, Cs5, E5, A5], 0, 0.08, 0.12, 0.28, 'triangle'),
    ...chord([A5, E6], 0.34, 0.26, 0.2, 'triangle')
  ],
  // A: impacto grave e power chord, com uma nota alta no fim.
  4: [
    glide(150, 50, 0, 0.35, 0.3),
    ...chord([A3, E4], 0.05, 0.5, 0.12, 'square'),
    soft(A5, 0.35, 0.45, 0.22, 'triangle')
  ],
  // S: impacto mais forte, power chord, subida rápida e acorde.
  5: [
    glide(130, 45, 0, 0.45, 0.35),
    ...chord([A3, E4], 0.05, 0.55, 0.13, 'square'),
    ...run([A4, Cs5, E5, A5], 0.45, 0.07, 0.1, 0.22, 'triangle'),
    ...chord([A5, E6], 0.76, 0.34, 0.2, 'triangle')
  ],
  // SS: impacto, riff de cinco notas, acorde aberto longo e brilho agudo.
  6: [
    glide(120, 40, 0, 0.5, 0.35),
    ...chord([A3, E4], 0.05, 0.6, 0.13, 'square'),
    ...run([A4, Cs5, E5, A5, Cs6], 0.5, 0.07, 0.1, 0.2, 'triangle'),
    ...chord([A4, E5, A5, Cs6], 0.9, 0.6, 0.12, 'triangle'),
    soft(E7, 1.1, 0.4, 0.08)
  ],
  // SSS: impacto duplo, riff de seis notas, acorde grande com grave e cintilar.
  7: [
    glide(130, 45, 0, 0.4, 0.3),
    glide(110, 35, 0.3, 0.5, 0.3),
    ...chord([A3, E4], 0.4, 0.6, 0.13, 'square'),
    ...run([A4, Cs5, E5, A5, Cs6, E6], 0.75, 0.07, 0.1, 0.18, 'triangle'),
    ...chord([A4, E5, A5, Cs6], 1.25, 0.9, 0.12, 'triangle'),
    soft(A2, 1.25, 0.9, 0.12),
    ...run([E7, A6, E7, A6], 1.5, 0.12, 0.18, 0.05)
  ]
}

/** Toca o stinger do rank. `level: true`: um rank novo corta o anterior, sem sobrepor. */
export function playBoostSound(stage: BoostStage): void {
  playNotes(BOOST_SOUNDS[stage], { level: true })
}

const firstPlay = oncePerKey()

/** Toca o som da celebração uma única vez (o StrictMode repete efeitos em dev). */
export function playBoostCelebration(key: number, stage: BoostStage): void {
  if (firstPlay(key)) playBoostSound(stage)
}
