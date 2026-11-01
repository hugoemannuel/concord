// Temas próprios → CSS. Cada tema vira um bloco [data-theme='custom-<id>'] com
// todos os tokens, igual aos prontos do assets/theme.css, mais os preenchimentos
// (degradês), o vidro e a forma; o app injeta isso num <style> (ver
// lib/themeStyleSheet.ts). As regras que usam essas variáveis ficam em
// assets/themeDecor.css. Os valores saem do gerador (hex e rgba que ele mesmo
// monta), nunca do texto da pessoa. Puro.

import { gradientCss, type FillSpec } from './gradient'
import { withAlpha } from './colorMath'
import { buildPalette, type Palette } from './palette'
import { shapeCss } from './shapeCss'
import { themeImageSrc } from './themeImage'
import type { ThemeInput } from './themeInput'

export interface ThemeStyleEntry {
  /** data-theme do tema: "custom-<id>" (ou "custom-draft" na prévia do editor). */
  key: string
  input: ThemeInput
}

const image = (fill: FillSpec): string => gradientCss(fill) ?? 'none'

/** A janela atrás do vidro: o fundo principal (sólido vira um "degradê" de uma cor). */
function windowImage(fill: FillSpec | null): string {
  if (!fill) return 'none'
  return gradientCss(fill) ?? `linear-gradient(${fill.stops[0]}, ${fill.stops[0]})`
}

/** A imagem de fundo com o véu por cima; null = sem imagem (ou não é do app). */
function imageLayer(input: ThemeInput, palette: Palette, origin: string): string | null {
  const src = themeImageSrc(input.image, origin)
  if (!src || !palette.imageVeil) return null
  const { color, alpha } = palette.imageVeil
  const veil = withAlpha(color, alpha)
  return `linear-gradient(${veil}, ${veil}), url("${src}")`
}

function windowDecls(input: ThemeInput, palette: Palette, origin: string): string[] {
  const image = imageLayer(input, palette, origin)
  const blur = image && input.imageBlur > 0 ? `blur(${input.imageBlur}px)` : 'none'
  return [`--app-image: ${image ?? windowImage(palette.fills.window)};`, `--app-image-filter: ${blur};`]
}

function fillDecls({ fills, blur }: Palette): string[] {
  return [
    `--fill-primary: ${image(fills.primary)};`,
    `--fill-secondary: ${image(fills.secondary)};`,
    `--fill-surface: ${image(fills.surface)};`,
    `--fill-brand: ${image(fills.brand)};`,
    `--fill-brand-hover: ${image(fills.brandHover)};`,
    `--panel-backdrop: ${blur > 0 ? `blur(${blur}px)` : 'none'};`
  ]
}

/**
 * Painéis opacos, sem desfoque: para quem pede menos transparência no sistema e
 * sempre nas telas cheias por cima do app (Configurações, .settings-shell em
 * shared/ui/SettingsShell), senão o chat aparece atrás do texto delas.
 */
function opaqueRule(sel: string, opaque: Palette['opaque']): string[] {
  if (!opaque) return []
  const decls = Object.entries(opaque.tokens).map(([token, value]) => `--${token}: ${value};`)
  decls.push(`--fill-primary: ${image(opaque.primary)};`, `--fill-secondary: ${image(opaque.secondary)};`)
  decls.push('--app-image: none;', '--app-image-filter: none;', '--panel-backdrop: none;')
  const body = decls.join(' ')
  return [`@media (prefers-reduced-transparency: reduce) { ${sel} { ${body} } }`, `${sel} .settings-shell { ${body} }`]
}

function block({ key, input }: ThemeStyleEntry, origin: string): string {
  const palette = buildPalette(input)
  const { scheme, tokens, hero } = palette
  const sel = `[data-theme='${key}']`
  const shape = shapeCss(input)
  const decls = Object.entries(tokens).map(([token, value]) => `--${token}: ${value};`)
  if (hero) hero.forEach((color, i) => decls.push(`--hero-${i + 1}: ${color};`))
  decls.push(...fillDecls(palette), ...windowDecls(input, palette, origin), ...shape.always)
  const rules = [`${sel} { color-scheme: ${scheme}; ${decls.join(' ')} }`]
  if (hero) rules.push(`${sel} .app-decor { display: block; }`)
  if (shape.finePointer.length) rules.push(`@media (pointer: fine) { ${sel} { ${shape.finePointer.join(' ')} } }`)
  rules.push(...opaqueRule(sel, palette.opaque))
  return rules.join('\n')
}

/** `origin`: de onde vêm as imagens de fundo (lib/themeImage.ts imageOrigin; "" = mesma origem). */
export function customThemesCss(entries: ThemeStyleEntry[], origin = ''): string {
  return entries.map((entry) => block(entry, origin)).join('\n')
}
