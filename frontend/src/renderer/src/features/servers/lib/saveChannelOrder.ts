import type { ChannelType } from '../api/channels'
import { useServerStore } from '../store/serverStore'
import { showToast } from '../../../shared/store/toastStore'

/**
 * Servidor sem categorias: a ordem é por tipo, na lista de canais. Muda na hora
 * (o store cuida da fila); se o servidor recusar, volta e avisa.
 */
export async function saveChannelOrder(serverId: string, type: ChannelType, ids: string[]): Promise<void> {
  try {
    await useServerStore.getState().reorderChannels(serverId, type, ids)
  } catch {
    showToast.error('Não foi possível mudar a ordem dos canais.')
  }
}
