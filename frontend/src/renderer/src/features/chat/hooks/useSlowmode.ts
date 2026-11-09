import { useEffect, useState } from 'react'
import { useServerStore } from '../../servers/store/serverStore'
import { remainingSeconds, slowmodeRetryAfter, slowmodeView } from '../lib/slowmode'
import { useSlowmodeStore } from '../store/slowmodeStore'

/** id do canal de `channel:<id>` (DM e grupo não têm modo lento). */
const channelIdOf = (room: string): string | null =>
  room.startsWith('channel:') ? room.slice('channel:'.length) : null

export interface Slowmode {
  /** Texto da faixa (null = sem faixa). */
  text: string | null
  /** Ainda esperando a vez: o envio fica travado. */
  blocked: boolean
  /** A mensagem saiu: começa a contar a espera. */
  onSent: () => void
  /** O envio falhou: se foi o 429 do modo lento, trava pelo que o servidor disse. */
  onFailed: (err: unknown) => void
}

/** Modo lento da sala para o campo de mensagem (faixa, contagem e trava). */
export function useSlowmode(room: string, exempt: boolean): Slowmode {
  const channelId = channelIdOf(room)
  const seconds = useServerStore(
    (s) => s.channels.find((c) => c.id === channelId)?.slowmode_seconds ?? 0
  )
  const until = useSlowmodeStore((s) => s.until[room] ?? 0)
  const block = useSlowmodeStore((s) => s.block)
  const [now, setNow] = useState(() => Date.now())
  const remaining = remainingSeconds(until, now)

  // Relógio da contagem: só anda enquanto falta tempo.
  useEffect(() => {
    if (until <= Date.now()) return
    setNow(Date.now())
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= until) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [until])

  const view = slowmodeView({ seconds, exempt, remaining })
  return {
    ...view,
    onSent: () => {
      if (seconds > 0 && !exempt) block(room, seconds)
    },
    onFailed: (err) => {
      const retryAfter = slowmodeRetryAfter(err)
      if (retryAfter !== null) block(room, retryAfter)
    }
  }
}
