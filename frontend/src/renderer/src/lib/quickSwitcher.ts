import type { NameStyle } from './nameStyle'

export type SwitcherKind = 'person' | 'server' | 'channel'

export interface SwitcherItem {
  key: string
  kind: SwitcherKind
  label: string
  hint: string
  route: string
  avatar?: { userId: string; url?: string | null }
  nameStyle?: NameStyle
  /** Ícone do servidor (kind 'server'). */
  iconUrl?: string | null
}

const PREFIX_KIND: Record<string, SwitcherKind> = { '@': 'person', '*': 'server', '#': 'channel' }

/**
 * Filtra como a busca do Discord: `@` só pessoas, `*` só servidores, `#` só
 * canais. Sem prefixo e sem texto, canais ficam de fora (seriam centenas).
 */
export function filterSwitcherItems(items: SwitcherItem[], rawQuery: string): SwitcherItem[] {
  let query = rawQuery.trim().toLowerCase()
  const kind = PREFIX_KIND[query.charAt(0)]
  if (kind) query = query.slice(1).trim()

  return items.filter((item) => {
    if (kind && item.kind !== kind) return false
    if (!kind && !query && item.kind === 'channel') return false
    if (!query) return true
    return item.label.toLowerCase().includes(query) || item.hint.toLowerCase().includes(query)
  })
}
