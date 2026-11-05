import type { FriendsTab } from '../../../shared/store/uiStore'

export const FRIENDS_TABS: FriendsTab[] = ['online', 'all', 'pending', 'blocked', 'add']

/** Aba pedida na URL (/friends?tab=...), ou null se não existir. */
export function parseFriendsTab(raw: string | null): FriendsTab | null {
  return FRIENDS_TABS.find((t) => t === raw) ?? null
}

/** A caixa "Buscar" filtra pessoas: não faz sentido em "Adicionar amigo". */
export function tabHasSearch(tab: FriendsTab): boolean {
  return tab !== 'add'
}

/** Classes do botão de aba (ativa x inativa). */
export function tabClass(active: boolean): string {
  return active ? 'bg-fg/10 text-strong' : 'text-muted hover:bg-fg/5 hover:text-normal'
}

/** O botão verde "Adicionar amigo" vira texto verde quando a aba está aberta. */
export function addTabClass(active: boolean): string {
  return active
    ? 'bg-transparent text-success'
    : 'bg-success-strong text-white hover:bg-success-strong-hover'
}

export interface TabCounts {
  pending: number
}

/** Número vermelho da aba (0 = sem selo). */
export function tabBadge(tab: FriendsTab, counts: TabCounts): number {
  return tab === 'pending' ? counts.pending : 0
}
