import { useState } from 'react'
import { eventErrorMessage } from '../lib/eventErrors'

/**
 * Roda uma ação do painel (responder, cancelar): trava os botões enquanto
 * dura e guarda o texto do erro para o aviso do painel.
 */
export function useEventAction(): {
  busy: boolean
  notice: string | null
  run: (action: () => Promise<void>) => Promise<void>
} {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const run = async (action: () => Promise<void>): Promise<void> => {
    setNotice(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setNotice(eventErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return { busy, notice, run }
}
