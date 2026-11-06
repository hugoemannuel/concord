import { errorMessage } from '../../../shared/lib/errorMessage'
import type { NotifySettings } from './notificationMute'

/** O que salvar as notificações usa de fora (store e aviso). */
export interface NotifySaveDeps {
  saveServer: (serverId: string, settings: NotifySettings) => Promise<void>
  saveChannel: (serverId: string, channelId: string, settings: NotifySettings) => Promise<void>
  error: (message: string) => void
}

/** Salva a opção do canal (se houver) ou do servidor; erro vira aviso. */
export async function saveNotifySettings(
  deps: NotifySaveDeps,
  serverId: string,
  channelId: string | undefined,
  next: NotifySettings
): Promise<void> {
  try {
    if (channelId) await deps.saveChannel(serverId, channelId, next)
    else await deps.saveServer(serverId, next)
  } catch (err) {
    deps.error(errorMessage(err, 'Não foi possível salvar as notificações.'))
  }
}
