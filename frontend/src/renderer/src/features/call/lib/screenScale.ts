// Escala de uma camada reduzida da live (a de 720p e a reserva) com os dois
// lados pares. O libwebrtc trunca largura/escala; com escala quebrada
// (janela de 2560×1438 → 1438/720) sai 1281×720, e o codificador da placa no
// Windows (Media Foundation) recusa lado ímpar: o H.264 cai no processador e o
// H.265, sem codificador por software, troca sozinho para VP8 (tela preta para
// quem assiste). Ver docs/adr/0048. Puro.

/** Quantos degraus de 2 px abaixo do alvo procurar até achar lados pares. */
const SEARCH = 32

const even = (value: number): boolean => value % 2 === 0

/**
 * O lado menor da camada: até `target` (nunca acima), com largura e altura
 * pares depois do truncamento. null = a fonte já está no alvo ou abaixo.
 */
export function evenSide(width: number, height: number, target: number): number | null {
  const short = Math.min(width, height)
  if (!short || short <= target) return null
  const long = Math.max(width, height)
  for (let side = target - (target % 2); side > target - SEARCH; side -= 2) {
    const scale = short / side
    if (even(Math.trunc(short / scale)) && even(Math.trunc(long / scale))) return side
  }
  return target
}

/** `scaleResolutionDownBy` da camada (lado menor / evenSide); fonte no alvo ou menor: 1. */
export function evenScale(width: number, height: number, target: number): number {
  const side = evenSide(width, height, target)
  return side === null ? 1 : Math.min(width, height) / side
}
