import { rename, stat } from 'fs/promises'
import { appendLog, logPath } from '../app/appLog'

const LOG_MAX_BYTES = 512 * 1024

/** Console e, no Linux, ~/.config/Concord/logs/update.log (o app abre sem terminal). */
export function logUpdate(message: string, error: unknown): void {
  console.error(`[update] ${message}:`, error)
  if (process.platform !== 'linux') return
  appendLog('update.log', `${message}: ${String(error)}`)
  // Um arquivo antigo só (update.log.1): não cresce para sempre.
  const path = logPath('update.log')
  void stat(path)
    .then((info) => (info.size > LOG_MAX_BYTES ? rename(path, `${path}.1`) : undefined))
    .catch(() => {})
}
