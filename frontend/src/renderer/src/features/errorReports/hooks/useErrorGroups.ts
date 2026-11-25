import { getErrorGroups, type ErrorGroupsReport, type ErrorSource } from '../api/errorReports'
import type { LoadState } from '../lib/errorPanelState'
import { useLoad } from './useLoad'

/** Os grupos de erro dos últimos `days` dias, com os filtros de origem e versão. */
export function useErrorGroups(
  days: number,
  source: ErrorSource | '',
  version: string
): { state: LoadState<ErrorGroupsReport>; reload: () => void } {
  return useLoad(JSON.stringify([days, source, version]), () =>
    getErrorGroups(days, source, version)
  )
}
