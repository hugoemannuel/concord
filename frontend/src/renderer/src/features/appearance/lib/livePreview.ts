// Prévia ao vivo do editor no app inteiro: o rascunho vira o bloco
// [data-theme='custom-draft'] e o <html> passa a mostrá-lo. Arrastar o seletor
// de cor muda o rascunho dezenas de vezes por segundo; aqui isso vira no máximo
// uma escrita por quadro (requestAnimationFrame), e as transições de cor ficam
// desligadas enquanto muda (data-theme-live), para não animar o app inteiro a
// cada quadro. Ver docs/adr/0041-aparencia-v2.md.

import { setThemePreview } from '../../settings/store/themeStore'
import { schemeOf } from './palette'
import { API_BASE_URL } from '../../../shared/lib/config'
import { customThemesCss } from './themeCss'
import { imageOrigin } from './themeImage'
import type { ThemeInput } from './themeInput'
import { DRAFT_THEME_STYLE, writeStyleSheet } from './themeStyleSheet'

/** As imagens de fundo vêm do servidor (no web, da mesma origem). */
const IMAGE_ORIGIN = imageOrigin(API_BASE_URL)

/** data-theme do rascunho do editor. */
export const DRAFT_KEY = 'custom-draft'
/** Quanto tempo parado até as transições voltarem. */
const SETTLE_MS = 250

type Schedule = (cb: () => void) => number
const schedule: Schedule =
  typeof requestAnimationFrame === 'function' ? (cb) => requestAnimationFrame(cb) : (cb) => Number(setTimeout(cb, 16))
const unschedule = (id: number): void =>
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id)

let frame = 0
let pending: ThemeInput | null = null
let settle: ReturnType<typeof setTimeout> | undefined

function markLive(on: boolean): void {
  if (typeof document === 'undefined') return
  if (on) document.documentElement.dataset.themeLive = ''
  else delete document.documentElement.dataset.themeLive
}

function flush(): void {
  frame = 0
  const input = pending
  pending = null
  if (!input) return
  writeStyleSheet(DRAFT_THEME_STYLE, customThemesCss([{ key: DRAFT_KEY, input }], IMAGE_ORIGIN))
  setThemePreview({ key: DRAFT_KEY, scheme: schemeOf(input.background) })
  markLive(true)
  clearTimeout(settle)
  settle = setTimeout(() => markLive(false), SETTLE_MS)
}

/** Mostra o rascunho no app (no próximo quadro; várias chamadas no mesmo quadro viram uma). */
export function showDraft(input: ThemeInput): void {
  pending = input
  if (!frame) frame = schedule(flush)
}

/** Acaba a prévia: o app volta ao tema escolhido (ou ao recém-salvo). */
export function stopDraft(): void {
  if (frame) unschedule(frame)
  frame = 0
  pending = null
  clearTimeout(settle)
  markLive(false)
  setThemePreview(null)
  writeStyleSheet(DRAFT_THEME_STYLE, '')
}
