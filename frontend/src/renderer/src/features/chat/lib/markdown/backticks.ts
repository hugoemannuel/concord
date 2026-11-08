// Crases do código (`trecho` e ```bloco```), comuns ao leitor e ao stripCode.

/** Pontuação ASCII: o que o "\" deixa literal. */
export const ESCAPABLE = /[!-/:-@[-`{-~]/

export function runLength(s: string, i: number): number {
  let j = i
  while (s[j] === '`') j++
  return j - i
}

/** Próxima sequência de exatamente n crases a partir de start. */
export function findRun(s: string, n: number, start: number): number {
  let j = start
  while (j < s.length) {
    if (s[j] !== '`') {
      j++
      continue
    }
    const m = runLength(s, j)
    if (m === n) return j
    j += m
  }
  return -1
}
