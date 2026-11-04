import { clamp01, easeOut, prog } from './sceneKit'

/**
 * Ritmo da cena do marco 30 (ms): crescer, florescer, impacto no número e
 * sumir. Sem dependências de canvas, para as outras peças da cena e os
 * testes.
 */

/** A coroa fecha, o clarão estoura e a tela treme. */
export const VINES_IMPACT_MS = 1200
/** O número entra de dentro do clarão. */
export const VINES_TITLE_MS = 1220

export const SHADE_IN = 420
export const BACK_FROM = 0
export const BACK_TO = 850
export const MAIN_FROM = 0
export const MAIN_TO = 840
/** Cada vinha principal começa um pouco depois da anterior. */
export const MAIN_STAGGER = 30
export const WREATH_FROM = 700
export const WREATH_TO = 1170
/** A grande esmeralda desce sobre a coroa. */
export const CROWN_FROM = 960
export const CROWN_TO = 1190
/** As flores das vinhas só abrem depois disto, mesmo se a ponta passou antes. */
export const BLOOM_FROM = 560

const FADE_FROM = 0.78

export const fadeAt = (t: number, durationMs: number): number =>
  1 - prog(t, durationMs * FADE_FROM, durationMs)

/** Curva do crescimento: começa logo (a vinha aparece já no início da cena). */
export const growEase = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - (2 - 2 * x) ** 2 / 2)

/** Inversa da growEase: em que fração do tempo a vinha chega em `y`. */
export function invGrowEase(y: number): number {
  const v = clamp01(y)
  return v < 0.5 ? Math.sqrt(v / 2) : 1 - Math.sqrt((1 - v) / 2)
}

/**
 * A onda verde do impacto passando por algo a `d` px do centro: 0 longe da
 * frente da onda, 1 em cima dela. As folhas tremem e as gemas acendem com isso.
 */
export function waveAt(t: number, d: number, reach: number): number {
  const p = prog(t, VINES_IMPACT_MS, VINES_IMPACT_MS + 1000)
  if (p <= 0 || p >= 1) return 0
  const front = reach * easeOut(p)
  return clamp01(1 - Math.abs(d - front) / (reach * 0.2)) * (1 - p)
}
