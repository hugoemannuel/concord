import { useState } from 'react'
import type { ListeningActivity } from '../lib/listeningActivity'
import { queueListening } from '../lib/queueListening'
import type { QueueTarget } from '../lib/queueTarget'

/** "Adicionar à fila do Maestro" com o estado "Adicionando…" até o servidor responder. */
export function useQueueListening(
  target: QueueTarget,
  listening: ListeningActivity
): { adding: boolean; add: () => Promise<void> } {
  const [adding, setAdding] = useState(false)
  const add = async (): Promise<void> => {
    setAdding(true)
    try {
      await queueListening(target, listening)
    } finally {
      setAdding(false)
    }
  }
  return { adding, add }
}
