import type { Note } from '../../../call/lib/sounds'

// Blocos dos pacotes de som: tudo sintetizado na hora (Web Audio), sem arquivo
// nenhum. Cada pacote combina estes timbres do seu jeito.

/** Frequência da nota MIDI (69 = lá 440 Hz). */
export const midi = (n: number): number => Math.round(440 * 2 ** ((n - 69) / 12) * 100) / 100

export function note(
  freq: number,
  at: number,
  duration: number,
  volume: number,
  wave: OscillatorType = 'sine',
  slide?: number
): Note {
  return { freq, at, duration, volume, wave, ...(slide ? { slide } : {}) }
}

/** Notas em sequência, `step` segundos entre uma e outra, no mesmo timbre. */
export function seq(
  voice: (freq: number, at: number) => Note[],
  freqs: number[],
  step: number,
  start = 0
): Note[] {
  return freqs.flatMap((f, i) => voice(f, start + i * step))
}

/**
 * Sino de vidro: fundamental mais parciais inarmônicos (2,76× e 5,4×) que
 * somem antes; o pico é 1,5× o volume.
 */
export function bell(freq: number, at: number, duration: number, volume: number): Note[] {
  return [
    note(freq, at, duration, volume),
    note(freq * 2.76, at, duration * 0.6, volume * 0.35),
    note(freq * 5.4, at, duration * 0.3, volume * 0.15)
  ]
}

/** Baqueta de madeira: triangular com um 4º harmônico curtinho no ataque. */
export function mallet(freq: number, at: number, duration: number, volume: number): Note[] {
  return [note(freq, at, duration, volume, 'triangle'), note(freq * 4, at, duration * 0.25, volume * 0.15)]
}

/** Bolha: senoide curta que sobe (ou desce, com `ratio` < 1) de repente. */
export function bloop(freq: number, at: number, volume: number, ratio = 2.2, duration = 0.08): Note {
  return note(freq, at, duration, volume, 'sine', freq * ratio)
}
