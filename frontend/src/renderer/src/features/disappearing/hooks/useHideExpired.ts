import { useMemo } from 'react'
import type { Message } from '../../chat/api/messages'
import { isExpired } from '../lib/disappearing'
import { useNow } from './useNow'

const CHECK_MS = 30_000

/**
 * Esconde na hora as mensagens cujo prazo passou (o servidor também apaga e
 * avisa, mas só no próximo ciclo). Reavalia a cada 30 s; sem vencidas devolve
 * o mesmo array, para não redesenhar a lista à toa.
 */
export function useHideExpired(messages: Message[]): Message[] {
  const now = useNow(CHECK_MS)
  return useMemo(
    () =>
      messages.some((m) => isExpired(m, now))
        ? messages.filter((m) => !isExpired(m, now))
        : messages,
    [messages, now]
  )
}
