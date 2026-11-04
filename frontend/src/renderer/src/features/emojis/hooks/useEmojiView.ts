import { useEmojiStore } from '../store/emojiStore'
import { useCustomEmojis } from './useCustomEmojis'
import { useExpressionOrigin } from './useExpressionOrigin'

export interface EmojiView {
  /** É de um servidor da pessoa (está na lista dela). */
  known: boolean
  /** A imagem pode aparecer: é da pessoa ou foi usado e ainda existe. */
  visible: boolean
  /** Já se sabe se aparece ou não (antes disso, só guarda o espaço). */
  settled: boolean
  /** O nome de verdade (a reação só tem o id). */
  name?: string
}

/**
 * Como mostrar um emoji personalizado: o que não é de um servidor da pessoa é
 * perguntado ao servidor (uma vez, e em lote) só depois que a lista dela chega.
 * Sem id (reação com emoji Unicode) não consulta nada.
 */
export function useEmojiView(id: string | null): EmojiView {
  useCustomEmojis()
  const knownName = useEmojiStore((s) => (id ? s.byId[id]?.name : undefined))
  const known = useEmojiStore((s) => id !== null && id in s.byId)
  const loaded = useEmojiStore((s) => s.loaded)
  const entry = useExpressionOrigin('emoji', id ?? '', id !== null && loaded && !known)
  return {
    known,
    visible: known || Boolean(entry && !entry.deleted),
    settled: known || (loaded && entry !== undefined),
    name: knownName ?? entry?.name
  }
}
