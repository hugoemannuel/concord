import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../../auth/store/authStore'
import { showToast } from '../../../shared/store/toastStore'
import { forwardMessage, listForwardTargets, type ForwardTargetServer } from '../api/forward'
import type { Message } from '../api/messages'
import { forwardDestinations, forwardErrorMessage, type ForwardDestination } from '../lib/forward'
import { useChatStore } from '../store/chatStore'

export interface ForwardMessageState {
  destinations: ForwardDestination[]
  /** Os canais ainda estão chegando (as conversas já estão na tela). */
  loadingChannels: boolean
  sending: boolean
  send: (destination: ForwardDestination, comment: string) => Promise<boolean>
}

/**
 * Seletor de destino do encaminhamento: as conversas do chat e os canais em
 * que você pode enviar (o servidor confere de novo ao encaminhar).
 */
export function useForwardMessage(message: Message): ForwardMessageState {
  const meId = useAuthStore((s) => s.user?.id)
  const conversations = useChatStore((s) => s.conversations)
  const [servers, setServers] = useState<ForwardTargetServer[]>([])
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    listForwardTargets()
      .catch(() => [] as ForwardTargetServer[])
      .then((list) => {
        if (cancelled) return
        setServers(list)
        setLoadingChannels(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const destinations = useMemo(
    () => forwardDestinations(servers, conversations, meId),
    [servers, conversations, meId]
  )

  // Enter de novo enquanto o primeiro envio está no ar não encaminha duas vezes.
  const send = async (destination: ForwardDestination, comment: string): Promise<boolean> => {
    if (sending) return false
    setSending(true)
    try {
      await forwardMessage(message, destination.target, comment.trim())
      showToast.success('Mensagem encaminhada')
      return true
    } catch (err) {
      showToast.error(forwardErrorMessage(err))
      return false
    } finally {
      setSending(false)
    }
  }

  return { destinations, loadingChannels, sending, send }
}
