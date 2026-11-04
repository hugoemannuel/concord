import { request } from '../../../shared/api/client'

/** Limite do POST /expressions/resolve (backend/internal/expression/resolve.go). */
export const MAX_RESOLVE = 100

/** De onde vem o item. Servidor privado, para quem não é membro, só diz que é privado. */
export interface ExpressionOrigin {
  server_name?: string
  server_icon_url?: string | null
  private?: boolean
}

export interface ResolvedExpression {
  id: string
  name: string
  /** Apagado na origem: sobrou só o nome. */
  deleted?: boolean
  origin?: ExpressionOrigin
}

export interface ResolvedSet {
  emojis: ResolvedExpression[]
  stickers: ResolvedExpression[]
}

export function resolveExpressions(emojiIds: string[], stickerIds: string[]): Promise<ResolvedSet> {
  return request<ResolvedSet>('/expressions/resolve', {
    method: 'POST',
    body: JSON.stringify({ emoji_ids: emojiIds, sticker_ids: stickerIds })
  })
}
