import { memo, useEffect, useMemo, useState } from 'react'
import type { Message } from '../../chat/api/messages'
import { useAuthStore } from '../../auth/store/authStore'
import { serverOrigins } from '../../servers/lib/appInviteLink'
import { previewLinks } from '../lib/previewLinks'
import { useLinkPreviewStore } from '../store/linkPreviewStore'
import LinkEmbed from './LinkEmbed'
import RemoveEmbedsDialog from './RemoveEmbedsDialog'

/** Um cartão: pede a prévia ao aparecer; carregando ou sem prévia, nada aparece. */
function LinkEmbedSlot({ url, onRemove }: { url: string; onRemove?: () => void }): React.JSX.Element | null {
  const entry = useLinkPreviewStore((s) => s.entries[url])
  useEffect(() => useLinkPreviewStore.getState().ensure(url), [url])
  if (entry?.status !== 'ready') return null
  return <LinkEmbed preview={entry.preview} onRemove={onRemove} />
}

/** O X do autor: abre a confirmação e remove as prévias da mensagem. */
function useRemoveEmbeds(message: Message): {
  confirming: boolean
  busy: boolean
  ask: () => void
  cancel: () => void
  confirm: () => Promise<void>
} {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const confirm = async (): Promise<void> => {
    setBusy(true)
    try {
      await useLinkPreviewStore.getState().removeEmbeds(message)
      setConfirming(false)
    } catch {
      // Falhou (rede, permissão): o diálogo fica aberto para tentar de novo ou cancelar.
    } finally {
      setBusy(false)
    }
  }
  return { confirming, busy, ask: () => setConfirming(true), cancel: () => setConfirming(false), confirm }
}

/**
 * Prévias dos links de uma mensagem (até 3), embaixo do texto e dos anexos,
 * como no Discord. Sem cartão quando o autor removeu as prévias.
 */
function MessageEmbeds({ message }: { message: Message }): React.JSX.Element | null {
  const isMine = useAuthStore((s) => s.user?.id === message.author_id)
  const urls = useMemo(
    () => (message.embeds_suppressed || !message.content ? [] : previewLinks(message.content, serverOrigins())),
    [message.content, message.embeds_suppressed]
  )
  const remove = useRemoveEmbeds(message)
  if (urls.length === 0) return null
  return (
    <>
      {urls.map((url) => (
        <LinkEmbedSlot key={url} url={url} onRemove={isMine ? remove.ask : undefined} />
      ))}
      {isMine && (
        <RemoveEmbedsDialog
          open={remove.confirming}
          busy={remove.busy}
          onCancel={remove.cancel}
          onConfirm={() => void remove.confirm()}
        />
      )}
    </>
  )
}

export default memo(MessageEmbeds)
