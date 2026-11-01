// Fontes da interface de um tema próprio (Forma e fonte): o nome no editor, a
// família (o chip mostra o nome escrito nela) e a pilha que vira --font-sans.
// As embutidas vêm de assets/themeFonts.css (OFL, ADR 0043). Puro.

import type { FontId } from './themeInput'

const EMOJI = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'"
const SANS = `'Noto Sans', 'Helvetica Neue', Arial, sans-serif, ${EMOJI}`
const SERIF = `Georgia, Cambria, 'Noto Serif', 'Times New Roman', serif, ${EMOJI}`
const MONO = `Consolas, 'DejaVu Sans Mono', 'Liberation Mono', Menlo, monospace, ${EMOJI}`

export interface FontOption {
  id: FontId
  label: string
  /** A pilha inteira de --font-sans; null = a padrão do app (Outfit). */
  stack: string | null
}

/** Na ordem do editor: sem serifa, arredondadas, condensada, serifadas, monoespaçadas. */
export const FONT_OPTIONS: FontOption[] = [
  { id: 'outfit', label: 'Padrão', stack: null },
  { id: 'system', label: 'Do sistema', stack: `system-ui, -apple-system, 'Segoe UI', Roboto, Ubuntu, Cantarell, ${SANS}` },
  { id: 'montserrat', label: 'Montserrat', stack: `'Montserrat', ${SANS}` },
  { id: 'comfortaa', label: 'Comfortaa', stack: `'Comfortaa', ${SANS}` },
  { id: 'fredoka', label: 'Fredoka', stack: `'Fredoka', ${SANS}` },
  { id: 'oswald', label: 'Oswald', stack: `'Oswald', ${SANS}` },
  { id: 'serif', label: 'Serifada', stack: SERIF },
  { id: 'bitter', label: 'Bitter', stack: `'Bitter', ${SERIF}` },
  { id: 'zilla', label: 'Zilla Slab', stack: `'Zilla Slab', ${SERIF}` },
  { id: 'mono', label: 'Monoespaçada', stack: 'var(--font-mono)' },
  { id: 'jetbrains', label: 'JetBrains Mono', stack: `'JetBrains Mono', ${MONO}` },
  { id: 'spacemono', label: 'Space Mono', stack: `'Space Mono', ${MONO}` }
]

/** A pilha da fonte (null = a padrão do app). */
export function fontStack(id: FontId): string | null {
  return FONT_OPTIONS.find((f) => f.id === id)?.stack ?? null
}

/** A família para escrever o nome da fonte nela mesma (o chip do editor). */
export function fontPreviewFamily(id: FontId): string | undefined {
  return fontStack(id) ?? undefined
}
