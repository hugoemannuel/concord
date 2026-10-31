import { enqueueMusicQuery } from '../../music/api/music'
import { errorMessage } from '../../../shared/lib/errorMessage'
import { showToast } from '../../../shared/store/toastStore'
import type { ListeningActivity } from './listeningActivity'
import { listeningQuery } from './listeningLinks'
import type { QueueTarget } from './queueTarget'

export const QUEUE_DONE = 'Adicionada à fila do Maestro.'
export const QUEUE_ADDING = 'Adicionando…'
export const QUEUE_FAILED = 'Não deu para adicionar à fila.'

interface QueueDeps {
  enqueue: (serverId: string, query: string) => Promise<void>
  notify: (kind: 'success' | 'error', message: string) => void
}

const defaults: QueueDeps = {
  enqueue: enqueueMusicQuery,
  notify: (kind, message) => showToast[kind](message)
}

/**
 * Põe a faixa que outra pessoa está ouvindo na fila do Maestro da minha call
 * (mesma validação do /play, no servidor). O aviso público sai pelo próprio
 * Maestro; aqui só o retorno para quem clicou.
 */
export async function queueListening(
  target: QueueTarget,
  listening: ListeningActivity,
  deps: QueueDeps = defaults
): Promise<void> {
  if (!('serverId' in target)) return
  try {
    await deps.enqueue(target.serverId, listeningQuery(listening))
    deps.notify('success', QUEUE_DONE)
  } catch (err) {
    deps.notify('error', errorMessage(err, QUEUE_FAILED))
  }
}

/** Texto do botão: "Adicionando…" enquanto o servidor não responde. */
export function queueButtonLabel(adding: boolean): string {
  return adding ? QUEUE_ADDING : 'Adicionar à fila do Maestro'
}
