import type { ChangelogRelease } from '../api/changelog'
import { compareVersions } from './timeline'

/** Destaques de uma versão, para o modal de novidades. */
export interface WhatsNewGroup {
  version: string
  features: string[]
  fixes: string[]
}

function highlights(release: ChangelogRelease): WhatsNewGroup {
  const group: WhatsNewGroup = { version: release.version, features: [], fixes: [] }
  for (const e of release.entries) {
    if (e.highlight) (e.kind === 'feature' ? group.features : group.fixes).push(e.text)
  }
  return group
}

const inRange = (version: string, seen: string, current: string): boolean =>
  compareVersions(version, seen) > 0 && compareVersions(version, current) <= 0

/**
 * Destaques das versões depois da última vista até a atual (quem pulou várias
 * vê todas), da mais nova para a mais antiga. Sem nada visto (primeira vez no
 * aparelho) não mostra nada: quem acabou de chegar não recebe o histórico.
 */
export function whatsNewSince(
  releases: ChangelogRelease[],
  seen: string | null,
  current: string | null
): WhatsNewGroup[] {
  if (!seen || !current) return []
  return releases
    .filter((r) => inRange(r.version, seen, current))
    .map(highlights)
    .filter((g) => g.features.length + g.fixes.length > 0)
}
