// Temas próprios → CSS. Cada tema vira um bloco [data-theme='custom-<id>'] com
// todos os tokens, igual aos prontos do assets/theme.css; o app injeta isso num
// <style> (ver lib/themeStyleSheet.ts). Os valores saem do gerador (hex e rgba
// que ele mesmo monta), nunca do texto da pessoa. Puro.

import { buildPalette, type PaletteInput } from './palette'

export interface ThemeStyleEntry {
  /** data-theme do tema: "custom-<id>" (ou "custom-draft" na prévia do editor). */
  key: string
  input: PaletteInput
}

function block({ key, input }: ThemeStyleEntry): string {
  const { scheme, tokens, hero } = buildPalette(input)
  const decls = Object.entries(tokens).map(([token, value]) => `--${token}: ${value};`)
  if (hero) hero.forEach((color, i) => decls.push(`--hero-${i + 1}: ${color};`))
  const rules = [`[data-theme='${key}'] { color-scheme: ${scheme}; ${decls.join(' ')} }`]
  if (hero) rules.push(`[data-theme='${key}'] .app-decor { display: block; }`)
  return rules.join('\n')
}

export function customThemesCss(entries: ThemeStyleEntry[]): string {
  return entries.map(block).join('\n')
}
