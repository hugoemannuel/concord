import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../../../shared/api/client'
import { fetchDeviceReport, type DeviceReport } from '../../api/device/deviceReport'

export type DeviceReportState =
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'error' }
  | { status: 'ready'; report: DeviceReport }

/** Falha ao carregar: 403 = não é dev; o resto, erro (com "tentar de novo"). */
export function deviceFailedState(err: unknown): DeviceReportState {
  return err instanceof ApiError && err.status === 403
    ? { status: 'forbidden' }
    : { status: 'error' }
}

/** Os aparelhos dos últimos `days` dias; 403 = não é dev. */
export function useDeviceReport(days: number): { state: DeviceReportState; reload: () => void } {
  const [state, setState] = useState<DeviceReportState>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetchDeviceReport(days)
      .then((report) => !cancelled && setState({ status: 'ready', report }))
      .catch((err: unknown) => {
        if (!cancelled) setState(deviceFailedState(err))
      })
    return () => {
      cancelled = true
    }
  }, [days, version])
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { state, reload }
}
