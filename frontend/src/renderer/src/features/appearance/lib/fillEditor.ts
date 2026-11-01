// Regras do controle "sólido ou degradê" de cada preenchimento (destaque,
// fundo principal, barra lateral, cartões). Puro: devolve o novo `gradients`.

import { mix, rotateHue } from './colorMath'
import { MAX_GRADIENT_COLORS, type FillField, type Gradient, type PaletteInput } from './themeInput'

export type FillMode = 'solid' | Gradient['type']
type Gradients = PaletteInput['gradients']

/** Sem o campo (sólido) ou com o degradê novo. */
function put(gradients: Gradients, field: FillField, gradient: Gradient | undefined): Gradients {
  const { [field]: _old, ...rest } = gradients
  return gradient ? { ...rest, [field]: gradient } : rest
}

/** A segunda cor sugerida: no destaque, um matiz vizinho; nos fundos, um toque do destaque. */
export function suggestedStop(input: PaletteInput, field: FillField): string {
  return field === 'accent' ? rotateHue(input.accent, 35) : mix(input[field], input.accent, 0.3)
}

export function withMode(input: PaletteInput, field: FillField, mode: FillMode): Gradients {
  if (mode === 'solid') return put(input.gradients, field, undefined)
  const current = input.gradients[field]
  const gradient = current ? { ...current, type: mode } : { type: mode, angle: 135, colors: [suggestedStop(input, field)] }
  return put(input.gradients, field, gradient)
}

/** Troca a cor `index` (0 = a primeira depois da base). */
export function withStop(input: PaletteInput, field: FillField, index: number, color: string): Gradients {
  const g = input.gradients[field]
  if (!g) return input.gradients
  return put(input.gradients, field, { ...g, colors: g.colors.map((c, i) => (i === index ? color : c)) })
}

export function addStop(input: PaletteInput, field: FillField): Gradients {
  const g = input.gradients[field]
  if (!g || g.colors.length >= MAX_GRADIENT_COLORS) return input.gradients
  const last = g.colors[g.colors.length - 1]
  return put(input.gradients, field, { ...g, colors: [...g.colors, mix(last, input[field], 0.5)] })
}

export function removeStop(input: PaletteInput, field: FillField): Gradients {
  const g = input.gradients[field]
  if (!g || g.colors.length <= 1) return input.gradients
  return put(input.gradients, field, { ...g, colors: g.colors.slice(0, -1) })
}

export function withAngle(input: PaletteInput, field: FillField, angle: number): Gradients {
  const g = input.gradients[field]
  return g ? put(input.gradients, field, { ...g, angle }) : input.gradients
}
