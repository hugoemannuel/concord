import { ipcRenderer } from 'electron'
import type { DeviceTake } from '../shared/deviceStats'

// window.api.deviceStats: métricas do aparelho (main/deviceStats, docs/adr/0069).
export const deviceStatsApi = {
  /** O agregado desde a última vez (a primeira liga o amostrador). */
  take(): Promise<DeviceTake | null> {
    return ipcRenderer.invoke('device-stats:take')
  },
  /** A lista de servidores chegou: marca o tempo de abertura (uma vez). */
  usable(): void {
    ipcRenderer.send('device-stats:usable')
  }
}
