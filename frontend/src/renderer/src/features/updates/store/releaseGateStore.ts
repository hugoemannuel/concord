import { create } from 'zustand'
import { fetchChangelog, fetchRequiredVersion } from '../api/changelog'
import type { GateState } from '../lib/releaseGate'

/**
 * Versão mínima e releases para o modal obrigatório e o de novidades
 * (ADR 0066). A mínima é conferida de novo quando o servidor avisa que
 * publicou notas (WS changelog:update).
 */
interface ReleaseGateState extends GateState {
  load(): Promise<void>
  refreshRequired(): Promise<void>
}

async function installedVersion(): Promise<string | null> {
  const updates = typeof window === 'undefined' ? undefined : window.api?.updates
  if (!updates) return null
  return updates.currentVersion().catch(() => null)
}

export const useReleaseGateStore = create<ReleaseGateState>((set) => ({
  loaded: false,
  installed: null,
  minVersion: null,
  releases: [],

  load: async () => {
    // Sem rede ou servidor antigo: nada bloqueia e nada aparece.
    const [installed, releases, minVersion] = await Promise.all([
      installedVersion(),
      fetchChangelog().catch(() => []),
      fetchRequiredVersion().catch(() => null)
    ])
    set({ loaded: true, installed, releases, minVersion })
  },

  refreshRequired: async () => {
    try {
      set({ minVersion: await fetchRequiredVersion() })
    } catch {
      // Mantém a que já sabia.
    }
  }
}))
