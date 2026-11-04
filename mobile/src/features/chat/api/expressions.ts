import { request } from '../../../shared/api/client'

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

/** Limite do POST /expressions/resolve (backend/internal/expression/resolve.go). */
export const MAX_RESOLVE = 100

export function resolveEmojis(ids: string[]): Promise<{ emojis: ResolvedExpression[] }> {
  return request<{ emojis: ResolvedExpression[] }>('/expressions/resolve', {
    method: 'POST',
    body: JSON.stringify({ emoji_ids: ids, sticker_ids: [] })
  })
}
