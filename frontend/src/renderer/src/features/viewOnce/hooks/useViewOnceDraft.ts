import { useEffect, useState } from 'react'
import type { DraftAttachment } from '../../chat/lib/attachments'
import { canViewOnce, settleViewOnce } from '../lib/viewOnce'

/**
 * Marca "visualização única" do anexo em rascunho. Volta a desligada quando o
 * anexo deixa de permitir (removido, 2º anexo, áudio) e depois do envio (`reset`).
 */
export function useViewOnceDraft(
  drafts: DraftAttachment[],
  isConversation: boolean
): { viewOnce: boolean; toggle: () => void; allowed: boolean; reset: () => void } {
  const allowed = canViewOnce(drafts, isConversation)
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!allowed) setOn(false)
  }, [allowed])
  return {
    // Já vale desligado no mesmo render em que `allowed` cai.
    viewOnce: settleViewOnce(on, allowed),
    toggle: () => setOn((v) => !v),
    allowed,
    reset: () => setOn(false)
  }
}
