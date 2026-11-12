import type { DraftAttachment } from '../../lib/attachments'
import type { ExtraMessageData } from '../../api/messages'

/**
 * Visualização única só em conversa e com um único anexo, foto ou vídeo, que
 * já subiu ou está subindo (áudio, arquivo e canal ficam de fora).
 */
export function canViewOnce(drafts: DraftAttachment[], isConversation: boolean): boolean {
  if (!isConversation || drafts.length !== 1) return false
  const [d] = drafts
  const media = d.kind === 'image' || d.kind === 'video'
  return media && (d.status === 'done' || d.status === 'uploading')
}

/** O `extra` do envio: só leva viewOnce quando ligado. */
export function sendExtra(viewOnce: boolean): ExtraMessageData | undefined {
  return viewOnce ? { viewOnce: true } : undefined
}

/** A marca só vale enquanto o anexo atual permite visualização única. */
export function settleViewOnce(on: boolean, allowed: boolean): boolean {
  return on && allowed
}
