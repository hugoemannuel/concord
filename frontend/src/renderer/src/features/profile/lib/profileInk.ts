// Contraste (WCAG 2.x) e a cor do texto do cartão de perfil sobre o fundo
// escolhido no tema. As contas são as de shared/lib/contrast e colorMath.

import { contrastRatio } from '../../../shared/lib/contrast'
import { luminance, mix } from '../../appearance/lib/colorMath'

const COLOR = /^#[0-9a-f]{6}$/i

/** Luminância relativa (0 = preto, 1 = branco). */
export const relativeLuminance = luminance

/** Razão de contraste entre duas cores (1 a 21). */
export { contrastRatio }

/** Texto claro e escuro do cartão (o claro é o do app). */
export const LIGHT_INK = '#ffffff'
export const DARK_INK = '#1e1f22'
export type Ink = 'light' | 'dark'

/**
 * Cor do texto que dá mais contraste em todo o fundo: no degradê conta o pior
 * ponto (as duas pontas e o meio). Empate fica com o claro, o do app.
 */
export function pickInk(background: string[]): Ink {
  const valid = background.filter((c) => COLOR.test(c))
  if (valid.length === 0) return 'light'
  const points = valid.length > 1 ? [...valid, mix(valid[0], valid[valid.length - 1], 0.5)] : valid
  const worst = (ink: string): number => Math.min(...points.map((p) => contrastRatio(ink, p)))
  return worst(DARK_INK) > worst(LIGHT_INK) ? 'dark' : 'light'
}
