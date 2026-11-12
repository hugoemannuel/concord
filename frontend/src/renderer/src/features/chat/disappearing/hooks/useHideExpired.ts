import { useEffect, useMemo, useState } from 'react'
import type { Message } from '../../api/messages'
import { isExpired } from '../lib/disappearing'

const CHECK_MS = 30_000

/**
 * Esconde na hora as mensagens cujo prazo passou (o servidor também apaga e
 * avisa, mas só no próximo ciclo). Reavalia a cada 30 s; sem vencidas devolve
 * o mesmo array, para não redesenhar a lista à toa.
 */
export function useHideExpired(messages: Message[]): Message[] {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CHECK_MS)
    return () => clearInterval(id)
  }, [])
  return useMemo(
    () =>
      messages.some((m) => isExpired(m, now))
        ? messages.filter((m) => !isExpired(m, now))
        : messages,
    [messages, now]
  )
}
