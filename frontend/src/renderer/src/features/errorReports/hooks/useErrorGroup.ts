import { getErrorGroup, type ErrorGroupDetail } from '../api/errorReports'
import type { LoadState } from '../lib/errorPanelState'
import { useLoad } from './useLoad'

/** O detalhe de um grupo (pilha, telas, últimas ocorrências); null = nenhum aberto. */
export function useErrorGroup(
  fingerprint: string | null,
  days: number
): { state: LoadState<ErrorGroupDetail>; reload: () => void } {
  const key = fingerprint === null ? null : JSON.stringify([fingerprint, days])
  return useLoad(key, () => getErrorGroup(fingerprint ?? '', days))
}
