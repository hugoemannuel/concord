import type { ViewOnceMedia } from '../../api/messages'
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

export type PillState = 'unseen' | 'seen' | 'sender' | 'expired'

/** Como a pílula aparece: o autor vê o andamento; o destinatário, se ainda dá para abrir. */
export function pillState(v: ViewOnceMedia, authorId: string, meId: string): PillState {
  if (authorId === meId) return v.gone && v.viewer_ids.length === 0 ? 'expired' : 'sender'
  if (v.viewer_ids.includes(meId)) return 'seen'
  return v.gone ? 'expired' : 'unseen'
}

/** O texto da pílula (autor em grupo ganha "Vista por X de Y"). */
export function pillLabel(state: PillState, kind: ViewOnceMedia['kind'], v: ViewOnceMedia): string {
  const photo = kind === 'image'
  if (state === 'unseen') return photo ? 'Foto' : 'Vídeo'
  if (state === 'seen') return 'Aberta'
  if (state === 'expired') return 'Expirou'
  const base = photo ? 'Foto de visualização única' : 'Vídeo de visualização única'
  if (v.recipient_count <= 1) return base
  return `${base} · Vista por ${v.viewer_ids.length} de ${v.recipient_count}`
}

/** A pergunta da confirmação (só na primeira abertura). */
export function confirmText(kind: ViewOnceMedia['kind']): string {
  return kind === 'image'
    ? 'Esta foto só pode ser vista uma vez. Ao fechar, ela some.'
    : 'Este vídeo só pode ser visto uma vez. Ao fechar, ele some.'
}

/** O pedido de abertura voltou 410: já viu ou expirou. */
export function isGoneError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { status?: number }).status === 410
}

/** O que a pílula mostra logo após o visualizador fechar, até o servidor confirmar. */
export function outcomeState(outcome: 'seen' | 'gone' | 'cancelled'): PillState | null {
  if (outcome === 'seen') return 'seen'
  return outcome === 'gone' ? 'expired' : null
}
