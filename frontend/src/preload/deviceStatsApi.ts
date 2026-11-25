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
  },
  /** O PC acordou: quanto tempo ficou suspenso (ms; docs/adr/0074). */
  onSlept(cb: (sleptMs: number) => void): () => void {
    const handler = (_event: unknown, sleptMs: unknown): void => {
      if (typeof sleptMs === 'number' && sleptMs >= 0) cb(sleptMs)
    }
    ipcRenderer.on('device-stats:slept', handler)
    return () => ipcRenderer.removeListener('device-stats:slept', handler)
  }
}
