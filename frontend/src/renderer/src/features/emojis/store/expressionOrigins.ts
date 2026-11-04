import { create } from 'zustand'
import { MAX_RESOLVE, resolveExpressions, type ResolvedExpression } from '../api/expressions'

// O que quem recebeu a mensagem sabe de um emoji ou figurinha que não é de um
// servidor seu. Os pedidos do mesmo instante viram uma consulta só. Por id:
// undefined = ainda não sabe; null = não pode conhecer; senão, o item.

export type OriginKind = 'emoji' | 'sticker'
type OriginMap = Record<string, ResolvedExpression | null>

interface OriginsState {
  emoji: OriginMap
  sticker: OriginMap
}

export const useExpressionOrigins = create<OriginsState>(() => ({ emoji: {}, sticker: {} }))

const pending: Record<OriginKind, Set<string>> = { emoji: new Set(), sticker: new Set() }
const inFlight: Record<OriginKind, Set<string>> = { emoji: new Set(), sticker: new Set() }
let timer: ReturnType<typeof setTimeout> | null = null

function fill(kind: OriginKind, ids: string[], found: ResolvedExpression[]): void {
  useExpressionOrigins.setState((s) => {
    const next: OriginMap = { ...s[kind] }
    for (const id of ids) next[id] = null
    for (const item of found) next[item.id] = item
    return { [kind]: next }
  })
}

async function resolveBatch(emojiIds: string[], stickerIds: string[]): Promise<void> {
  try {
    const set = await resolveExpressions(emojiIds, stickerIds)
    fill('emoji', emojiIds, set.emojis)
    fill('sticker', stickerIds, set.stickers)
  } catch {
    // Sem rede: fica sem resposta, e a próxima vez que aparecer pergunta de novo.
  } finally {
    for (const id of emojiIds) inFlight.emoji.delete(id)
    for (const id of stickerIds) inFlight.sticker.delete(id)
  }
}

function flush(): void {
  timer = null
  const emojis = [...pending.emoji]
  const stickers = [...pending.sticker]
  pending.emoji.clear()
  pending.sticker.clear()
  for (let i = 0; i < Math.max(emojis.length, stickers.length); i += MAX_RESOLVE) {
    void resolveBatch(emojis.slice(i, i + MAX_RESOLVE), stickers.slice(i, i + MAX_RESOLVE))
  }
}

export function requestOrigin(kind: OriginKind, id: string): void {
  if (useExpressionOrigins.getState()[kind][id] !== undefined || inFlight[kind].has(id)) return
  inFlight[kind].add(id)
  pending[kind].add(id)
  timer ??= setTimeout(flush, 0)
}

/** Troca de conta (o que cada um pode conhecer muda) e testes. */
export function resetExpressionOrigins(): void {
  if (timer) clearTimeout(timer)
  timer = null
  for (const kind of ['emoji', 'sticker'] as const) {
    pending[kind].clear()
    inFlight[kind].clear()
  }
  useExpressionOrigins.setState({ emoji: {}, sticker: {} })
}
