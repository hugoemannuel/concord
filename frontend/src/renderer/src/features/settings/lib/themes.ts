// Temas de cor (Configurações → Aparência). As cores ficam em assets/theme.css
// (tokens semânticos por [data-theme]); aqui só a lista, a preferência salva e
// a leitura do CSS que o teste de contraste usa. Puro, sem DOM.

export type ThemeId =
  | 'discord-dark'
  | 'discord-light'
  | 'amoled'
  | 'midnight'
  | 'forest'
  | 'sunset'
  | 'neon'
  | 'high-contrast'

/** Tema próprio da pessoa (features/appearance): data-theme="custom-<id>". */
export type CustomThemeKey = `custom-${string}`

/** O tema que vai no data-theme: um pronto ou um próprio. */
export type AppliedTheme = ThemeId | CustomThemeKey

/** O que o usuário escolhe: um tema ou seguir o claro/escuro do sistema. */
export type ThemePreference = AppliedTheme | 'system'

export interface ThemeInfo {
  id: ThemeId
  label: string
  description: string
  scheme: 'dark' | 'light'
}

export const DEFAULT_THEME: ThemeId = 'discord-dark'
export const THEME_STORAGE_KEY = 'concord:theme'

export const THEMES: readonly ThemeInfo[] = [
  {
    id: 'discord-dark',
    label: 'Discord Escuro',
    description: 'As cores do tema escuro do Discord.',
    scheme: 'dark'
  },
  {
    id: 'discord-light',
    label: 'Discord Claro',
    description: 'As cores do tema claro do Discord.',
    scheme: 'light'
  },
  {
    id: 'amoled',
    label: 'Preto AMOLED',
    description: 'Preto quase puro com vidro e brilho ao fundo (o visual antigo).',
    scheme: 'dark'
  },
  { id: 'midnight', label: 'Meia-noite', description: 'Azul-marinho escuro.', scheme: 'dark' },
  { id: 'forest', label: 'Floresta', description: 'Verdes escuros de mata.', scheme: 'dark' },
  { id: 'sunset', label: 'Pôr do sol', description: 'Marrons e laranjas quentes.', scheme: 'dark' },
  { id: 'neon', label: 'Roxo neon', description: 'Roxo profundo com brilho neon.', scheme: 'dark' },
  {
    id: 'high-contrast',
    label: 'Alto contraste',
    description: 'Preto e branco puros, bordas fortes.',
    scheme: 'dark'
  }
]

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id))

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_IDS.has(value)
}

const CUSTOM_KEY = /^custom-[a-z0-9]{1,24}$/

export function isCustomThemeKey(value: unknown): value is CustomThemeKey {
  return typeof value === 'string' && CUSTOM_KEY.test(value)
}

/** Valor salvo no localStorage → preferência válida (lixo ou nada = padrão). */
export function parseThemePreference(raw: string | null | undefined): ThemePreference {
  if (raw === 'system' || isThemeId(raw) || isCustomThemeKey(raw)) return raw
  return DEFAULT_THEME
}

/**
 * "Seguir o sistema" vira Discord Claro ou Escuro; tema próprio que não existe
 * aqui (apagado ou ainda não carregado) vira o padrão; o resto é o próprio tema.
 */
export function resolveTheme(
  pref: ThemePreference,
  systemPrefersDark: boolean,
  hasCustom: (key: CustomThemeKey) => boolean = () => false
): AppliedTheme {
  if (pref === 'system') return systemPrefersDark ? 'discord-dark' : 'discord-light'
  if (isCustomThemeKey(pref)) return hasCustom(pref) ? pref : DEFAULT_THEME
  return pref
}

/** Tokens que todo tema precisa definir (ver o cabeçalho de assets/theme.css). */
export const THEME_TOKENS = [
  'bg-app',
  'bg-tertiary',
  'bg-secondary',
  'bg-primary',
  'bg-members',
  'bg-surface',
  'bg-floating',
  'bg-modal',
  'bg-input',
  'bg-accent',
  'bg-hover',
  'bg-active',
  'bg-selected',
  'scrim',
  'border-subtle',
  'border-normal',
  'border-strong',
  'text-strong',
  'text-normal',
  'text-secondary',
  'text-muted',
  'text-faint',
  'text-link',
  'text-brand',
  'text-positive',
  'text-danger',
  'text-warning',
  'interactive-normal',
  'interactive-hover',
  'interactive-active',
  'interactive-muted',
  'brand',
  'brand-hover',
  'green',
  'green-strong',
  'green-strong-hover',
  'red',
  'red-strong',
  'red-strong-hover',
  'yellow',
  'fg',
  'scrollbar-thumb',
  'scrollbar-thumb-hover',
  'shadow',
  'decor-opacity'
] as const

export type ThemeToken = (typeof THEME_TOKENS)[number]

/**
 * Lê os blocos `[data-theme='x'] { --token: valor; }` de um CSS. Comentários
 * saem antes; o bloco `:root` junto do Discord Escuro conta como ele.
 */
export function parseThemeCss(css: string): Record<string, Record<string, string>> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Record<string, Record<string, string>> = {}
  const block = /((?:[^{}]*?\[data-theme='[\w-]+'\][^{}]*?))\{([^{}]*)\}/g
  for (const match of clean.matchAll(block)) {
    const ids = [...match[1].matchAll(/\[data-theme='([\w-]+)'\]/g)].map((m) => m[1])
    const tokens: Record<string, string> = {}
    for (const decl of match[2].split(';')) {
      const m = /^\s*--([\w-]+)\s*:\s*(.+?)\s*$/s.exec(decl)
      if (m) tokens[m[1]] = m[2]
    }
    for (const id of ids) out[id] = { ...out[id], ...tokens }
  }
  return out
}
