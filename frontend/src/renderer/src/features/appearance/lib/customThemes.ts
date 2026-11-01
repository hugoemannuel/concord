// Temas próprios (Configurações → Aparência → Seus temas): o formato, a
// validação do que vem do servidor ou do localStorage e as sementes dos temas
// prontos (o "começar de"). Puro. Ver docs/adr/0040-aparencia-personalizada.md.

import { isCustomThemeKey, type CustomThemeKey, type ThemeId } from '../../settings/lib/themes'
import { PRESET_SEEDS } from './presetSeeds'
import { parseThemeInput } from './parseTheme'
import { inputOf, type ThemeInput } from './themeInput'

export interface CustomTheme extends ThemeInput {
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
  const input = parseThemeInput(raw)
  const id = (raw as Record<string, unknown> | null)?.id
  if (!input || typeof id !== 'string' || !ID.test(id)) return null
  return { id, name: cleanName((raw as Record<string, unknown>).name), ...input }
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
export function seedOf(theme: string, existing: CustomTheme[]): ThemeInput {
  const custom = existing.find((t) => customThemeKey(t.id) === theme)
  if (custom) return inputOf(custom)
  return PRESET_SEEDS[theme as ThemeId] ?? PRESET_SEEDS['discord-dark']
}

/** Tema próprio novo, com id e nome livres, partindo das cores `seed`. */
export function newCustomTheme(seed: ThemeInput, existing: CustomTheme[], random = Math.random): CustomTheme {
  return {
    id: freshId(new Set(existing.map((t) => t.id)), random),
    name: freshName(existing),
    ...inputOf(seed)
  }
}
