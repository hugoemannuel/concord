import { useState } from 'react'
import type { DraftAttachment } from '../../chat/lib/attachments'
import {
  canViewOnce,
  settleViewOnce,
  syncViewOnce,
  toggleViewOnceKey,
  viewOnceKey,
  type ViewOnceState
} from '../lib/viewOnce'

/**
 * Marca "visualização única" do anexo em rascunho. Fica presa à sala e ao
 * anexo: trocar de sala, de arquivo ou perder a permissão (removido, 2º anexo,
 * áudio) a desliga de vez, e `reset` a desliga depois do envio.
 */
export function useViewOnceDraft(
  room: string,
  drafts: DraftAttachment[],
  isConversation: boolean
): { viewOnce: boolean; toggle: () => void; allowed: boolean; reset: () => void } {
  const allowed = canViewOnce(drafts, isConversation)
  const key = viewOnceKey(room, drafts, allowed)
  const [state, setState] = useState<ViewOnceState>({ seen: key, on: null })
  const current = syncViewOnce(state, key)
  if (current !== state) setState(current)
  return {
    viewOnce: settleViewOnce(current.on, key),
    toggle: () =>
      setState((s) => {
        const c = syncViewOnce(s, key)
        return { seen: key, on: toggleViewOnceKey(c.on, key) }
      }),
    allowed,
    reset: () => setState({ seen: key, on: null })
  }
}
