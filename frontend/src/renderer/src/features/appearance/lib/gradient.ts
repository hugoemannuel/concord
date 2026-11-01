// Degradê → CSS. Os valores saem do gerador (hex e rgba que ele mesmo monta),
// nunca do texto da pessoa. Puro.

import type { GradientType } from './themeInput'

/** Um preenchimento pronto para o CSS: as paradas (já ajustadas) e o formato. */
export interface FillSpec {
  type: GradientType
  angle: number
  stops: string[]
}

/** CSS do degradê; uma parada só = cor sólida, sem imagem (null). */
export function gradientCss({ type, angle, stops }: FillSpec): string | null {
  if (stops.length < 2) return null
  const list = stops.join(', ')
  return type === 'radial' ? `radial-gradient(ellipse at top, ${list})` : `linear-gradient(${angle % 360}deg, ${list})`
}
