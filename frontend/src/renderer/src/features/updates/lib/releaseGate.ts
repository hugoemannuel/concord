import type { ChangelogRelease } from '../api/changelog'
import { mustUpdate } from './requiredUpdate'
import { whatsNewSince, type WhatsNewGroup } from './whatsNew'

export interface GateState {
  loaded: boolean
  /** Versão instalada (desktop); null na web. */
  installed: string | null
  minVersion: string | null
  releases: ChangelogRelease[]
}

/** O que mostrar ao abrir: o modal obrigatório, o de novidades ou nada (ADR 0066). */
export type GateView =
  | { kind: 'required'; installed: string; minVersion: string }
  | { kind: 'whatsNew'; current: string; groups: WhatsNewGroup[] }
  /** current: versão a gravar como vista (null enquanto não se sabe). */
  | { kind: 'none'; current: string | null }

/** Versão em uso: a instalada no desktop; na web, a do último deploy (a mais nova). */
export function currentVersionOf(s: Pick<GateState, 'installed' | 'releases'>): string | null {
  return s.installed ?? s.releases[0]?.version ?? null
}

export function gateView(s: GateState, seen: string | null): GateView {
  if (!s.loaded) return { kind: 'none', current: null }
  if (s.installed && s.minVersion && mustUpdate(s.installed, s.minVersion)) {
    return { kind: 'required', installed: s.installed, minVersion: s.minVersion }
  }
  const current = currentVersionOf(s)
  const groups = whatsNewSince(s.releases, seen, current)
  if (current && groups.length > 0) return { kind: 'whatsNew', current, groups }
  return { kind: 'none', current }
}

/**
 * Sem modal para mostrar, a versão atual passa a ser a vista (primeira vez no
 * aparelho ou versão sem destaques): o próximo modal só traz o que vier depois.
 */
export function seenToWrite(view: GateView, seen: string | null): string | null {
  if (view.kind !== 'none' || !view.current || view.current === seen) return null
  return view.current
}
