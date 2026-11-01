// Temas próprios (Configurações → Aparência → Seus temas): o formato, a
// validação do que vem do servidor ou do localStorage e as sementes dos temas
// prontos (o "começar de"). Puro. Ver docs/adr/0040-aparencia-personalizada.md.

import { isCustomThemeKey, type CustomThemeKey, type ThemeId } from '../../settings/lib/themes'
import { isHexColor } from './colorMath'
import type { PaletteInput } from './palette'

export interface CustomTheme extends PaletteInput {
  /** [a-z0-9]{1,24}; vira data-theme="custom-<id>". */
  id: string
  name: string
}

export const MAX_CUSTOM_THEMES = 10
export const NAME_MAX = 32
export const DEFAULT_NAME = 'Meu tema'
/** Cópia local da lista (abre já com as cores certas; o overlay lê daqui). */
export const CUSTOM_THEMES_STORAGE_KEY = 'concord:custom-themes'

const ID = /^[a-z0-9]{1,24}$/
const COLOR_FIELDS = ['accent', 'background', 'sidebar', 'card', 'text'] as const

export function customThemeKey(id: string): CustomThemeKey {
  return `custom-${id}`
}

/** "custom-<id>" → id; outra coisa → null. */
export function customThemeId(key: string): string | null {
  return isCustomThemeKey(key) ? key.slice('custom-'.length) : null
}

/** Troca (mesmo id) ou acrescenta no fim. */
export function upsertTheme(list: CustomTheme[], theme: CustomTheme): CustomTheme[] {
  return list.some((t) => t.id === theme.id) ? list.map((t) => (t.id === theme.id ? theme : t)) : [...list, theme]
}

export function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().slice(0, NAME_MAX).trim() : ''
  return name || DEFAULT_NAME
}

function parseTheme(raw: unknown): CustomTheme | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !ID.test(r.id)) return null
  if (!COLOR_FIELDS.every((f) => isHexColor(r[f]))) return null
  if (r.glow !== '' && !isHexColor(r.glow)) return null
  const color = (f: string): string => (r[f] as string).toLowerCase()
  return {
    id: r.id,
    name: cleanName(r.name),
    accent: color('accent'),
    background: color('background'),
    sidebar: color('sidebar'),
    card: color('card'),
    text: color('text'),
    glow: color('glow')
  }
}

/** Lista vinda de fora → só temas válidos, sem id repetido, até o limite. */
export function normalizeCustomThemes(raw: unknown): CustomTheme[] {
  if (!Array.isArray(raw)) return []
  const out: CustomTheme[] = []
  for (const item of raw) {
    const theme = parseTheme(item)
    if (theme && !out.some((t) => t.id === theme.id)) out.push(theme)
    if (out.length === MAX_CUSTOM_THEMES) break
  }
  return out
}

/**
 * As escolhas que reproduzem cada tema pronto (fundos translúcidos já compostos
 * sobre o --bg-app). O teste confere contra o assets/theme.css.
 */
export const PRESET_SEEDS: Record<ThemeId, PaletteInput> = {
  'discord-dark': { accent: '#5865f2', background: '#1a1a1e', sidebar: '#121214', card: '#242429', text: '#efeff1', glow: '' },
  'discord-light': { accent: '#5865f2', background: '#ffffff', sidebar: '#fbfbfb', card: '#ffffff', text: '#2e2e34', glow: '' },
  amoled: { accent: '#5865f2', background: '#07080b', sidebar: '#0a0b0e', card: '#111214', text: '#f2f3f5', glow: '#5b21b6' },
  midnight: { accent: '#2563eb', background: '#131c31', sidebar: '#0f172a', card: '#18233b', text: '#e2e8f0', glow: '' },
  forest: { accent: '#1f7a4d', background: '#182b21', sidebar: '#13221a', card: '#1d3428', text: '#e6f2ea', glow: '' },
  sunset: { accent: '#c2410c', background: '#33201c', sidebar: '#2a1a17', card: '#3b2621', text: '#fbeee6', glow: '' },
  neon: { accent: '#9333ea', background: '#180e29', sidebar: '#130a20', card: '#221438', text: '#f3e8ff', glow: '#5b21b6' },
  'high-contrast': { accent: '#1d4ed8', background: '#000000', sidebar: '#000000', card: '#0a0a0a', text: '#ffffff', glow: '' }
}

function freshId(taken: Set<string>, random: () => number): string {
  for (;;) {
    const id = Math.floor(random() * 36 ** 8)
      .toString(36)
      .padStart(8, '0')
    if (!taken.has(id)) return id
    random = Math.random
  }
}

function freshName(existing: CustomTheme[]): string {
  const names = new Set(existing.map((t) => t.name))
  if (!names.has(DEFAULT_NAME)) return DEFAULT_NAME
  let n = 2
  while (names.has(`${DEFAULT_NAME} ${n}`)) n++
  return `${DEFAULT_NAME} ${n}`
}

/** As cores de partida de um tema em uso: as do próprio ou a semente do pronto. */
export function seedOf(theme: string, existing: CustomTheme[]): PaletteInput {
  const custom = existing.find((t) => customThemeKey(t.id) === theme)
  if (custom) return colorsOf(custom)
  return PRESET_SEEDS[theme as ThemeId] ?? PRESET_SEEDS['discord-dark']
}

export function colorsOf({ accent, background, sidebar, card, text, glow }: PaletteInput): PaletteInput {
  return { accent, background, sidebar, card, text, glow }
}

/** Tema próprio novo, com id e nome livres, partindo das cores `seed`. */
export function newCustomTheme(seed: PaletteInput, existing: CustomTheme[], random = Math.random): CustomTheme {
  return {
    id: freshId(new Set(existing.map((t) => t.id)), random),
    name: freshName(existing),
    ...colorsOf(seed)
  }
}
