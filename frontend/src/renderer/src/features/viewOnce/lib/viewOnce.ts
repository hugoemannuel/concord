import type { ViewOnceMedia } from '../../chat/api/messages'
import type { DraftAttachment } from '../../chat/lib/attachments'
import type { ExtraMessageData } from '../../chat/api/messages'

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

/** `locked`: quem não estava entre os destinatários (entrou no grupo depois): nunca abre. */
export type PillState = 'unseen' | 'seen' | 'sender' | 'expired' | 'locked'

/** Como a pílula aparece: o autor vê o andamento; o destinatário, se ainda dá para abrir. */
export function pillState(v: ViewOnceMedia, authorId: string, meId: string): PillState {
  if (authorId === meId) return v.gone && v.viewer_ids.length === 0 ? 'expired' : 'sender'
  if (v.viewer_ids.includes(meId)) return 'seen'
  if (v.recipient_ids && !v.recipient_ids.includes(meId)) return 'locked'
  return v.gone ? 'expired' : 'unseen'
}

/** O texto da pílula (autor em grupo ganha "Vista por X de Y"; bloqueada, o rótulo sem contagem). */
export function pillLabel(state: PillState, kind: ViewOnceMedia['kind'], v: ViewOnceMedia): string {
  const photo = kind === 'image'
  if (state === 'unseen') return photo ? 'Foto' : 'Vídeo'
  if (state === 'seen') return 'Aberta'
  if (state === 'expired') return 'Expirou'
  const base = photo ? 'Foto de visualização única' : 'Vídeo de visualização única'
  if (state === 'locked' || v.recipient_count <= 1) return base
  return `${base} · Vista por ${v.viewer_ids.length} de ${v.recipient_count}`
}

/** O estado mostrado depois de abrir, preso à versão da mídia em que nasceu. */
export interface LocalPill {
  state: PillState
  key: string
}

/** Muda quando o servidor muda a mídia (message:update com quem viu ou se sumiu). */
export function mediaKey(v: ViewOnceMedia): string {
  return `${v.gone}|${v.viewer_ids.join(',')}`
}

/** O estado local vale até o servidor mandar outra versão da mídia; aí manda o servidor. */
export function shownPillState(
  local: LocalPill | null,
  v: ViewOnceMedia,
  authorId: string,
  meId: string
): PillState {
  if (local && local.key === mediaKey(v)) return local.state
  return pillState(v, authorId, meId)
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

/** O pedido de abertura voltou 403: não estava entre os destinatários (é definitivo). */
export function isForbiddenError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { status?: number }).status === 403
}

type Outcome = 'seen' | 'gone' | 'cancelled' | 'forbidden'

const OUTCOME_STATE: Record<Outcome, PillState | null> = {
  seen: 'seen',
  gone: 'expired',
  forbidden: 'locked',
  cancelled: null
}

/** O que a pílula mostra logo após o visualizador fechar, até o servidor confirmar. */
export function outcomeState(outcome: Outcome): PillState | null {
  return OUTCOME_STATE[outcome]
}
