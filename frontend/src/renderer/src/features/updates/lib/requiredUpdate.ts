import { compareVersions } from './timeline'

/**
 * Atualização obrigatória (ADR 0066): a versão instalada é anterior à mínima
 * que o servidor exige. Na web não há versão instalada (é sempre a do último
 * deploy) e sem mínima ninguém é bloqueado.
 */
export function mustUpdate(installed: string | null, minVersion: string | null): boolean {
  if (!installed || !minVersion) return false
  return compareVersions(installed, minVersion) < 0
}

export type RequiredUpdateStatus = 'idle' | 'searching' | 'downloading' | 'restarting'

/** Em que pé está o "Atualizar agora" do modal obrigatório (estado do useUpdateStore). */
export function requiredUpdateStatus(s: {
  requested: boolean
  version: string | null
  ready: boolean
  progress: number
}): RequiredUpdateStatus {
  if (!s.requested) return 'idle'
  if (!s.version) return 'searching'
  return s.ready || s.progress >= 100 ? 'restarting' : 'downloading'
}
