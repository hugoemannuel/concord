import { request } from '../../../shared/api/client'

export type ChangelogKind = 'feature' | 'fix'

export interface ChangelogEntry {
  kind: ChangelogKind
  text: string
  /** Aparece no modal de novidades (cabeçalho destaque: true). */
  highlight?: boolean
}

/** Uma versão do app e o que ela trouxe (backend: internal/changelog). */
export interface ChangelogRelease {
  version: string
  released_at: string
  summary: string
  /** Quem tem versão anterior precisa atualizar (ADR 0066). */
  required?: boolean
  entries: ChangelogEntry[]
}

/** Da release mais nova para a mais antiga. */
export function fetchChangelog(): Promise<ChangelogRelease[]> {
  return request<ChangelogRelease[]>('/changelog')
}

/** Versão mínima exigida pelo servidor; null se nenhuma. */
export async function fetchRequiredVersion(): Promise<string | null> {
  const { min_version } = await request<{ min_version: string }>('/changelog/required')
  return min_version || null
}
