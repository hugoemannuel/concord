// Textos do editor de tema próprio que dependem do resultado do gerador. Puro.

import type { PaletteField } from './palette'

const FIELD_NAMES: Record<PaletteField, string> = {
  accent: 'a cor de destaque',
  background: 'o fundo principal',
  sidebar: 'a barra lateral',
  card: 'os cartões',
  text: 'o texto',
  textMuted: 'o texto secundário',
  highlight: 'o realce'
}

/** Aviso do que o gerador mudou para passar no contraste; null se nada. */
export function adjustmentNotice(adjusted: PaletteField[]): string | null {
  if (adjusted.length === 0) return null
  const names = adjusted.map((f) => FIELD_NAMES[f])
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
  return `Ajustamos ${list} para dar para ler.`
}
