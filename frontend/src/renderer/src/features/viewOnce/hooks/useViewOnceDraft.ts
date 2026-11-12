import { useState } from 'react'
import type { DraftAttachment } from '../../chat/lib/attachments'
import { canViewOnce, settleViewOnce, toggleViewOnceKey, viewOnceKey } from '../lib/viewOnce'

/**
 * Marca "visualização única" do anexo em rascunho. Fica presa à sala e ao
 * anexo: trocar de sala, de arquivo ou perder a permissão (removido, 2º anexo,
 * áudio) a desliga, e `reset` a desliga depois do envio.
 */
export function useViewOnceDraft(
  room: string,
  drafts: DraftAttachment[],
  isConversation: boolean
): { viewOnce: boolean; toggle: () => void; allowed: boolean; reset: () => void } {
  const allowed = canViewOnce(drafts, isConversation)
  const key = viewOnceKey(room, drafts, allowed)
  const [onKey, setOnKey] = useState<string | null>(null)
  return {
    viewOnce: settleViewOnce(onKey, key),
    toggle: () => setOnKey((v) => toggleViewOnceKey(v, key)),
    allowed,
    reset: () => setOnKey(null)
  }
}
