// Liga a consulta da versão mínima (requiredVersion.ts) ao Electron: a versão
// instalada e o fetch do main (net.fetch respeita o proxy do sistema).
import { app, net } from 'electron'
import { requiredUpdateCheck } from './requiredVersion'

export function mandatoryUpdateFor(serverUrl: string | undefined): () => Promise<boolean> {
  return requiredUpdateCheck({ serverUrl, currentVersion: app.getVersion(), fetch: net.fetch })
}
