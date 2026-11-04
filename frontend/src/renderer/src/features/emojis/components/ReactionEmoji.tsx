import { reactionEmojiId } from '../lib/emojiToken'
import { originText } from '../lib/originText'
import { useEmojiView } from '../hooks/useEmojiView'
import { useExpressionOrigin } from '../hooks/useExpressionOrigin'
import CustomEmoji from './CustomEmoji'

const FALLBACK_NAME = 'emoji'

/** Nome legível da reação: o próprio emoji ou ":nome:" do personalizado. */
export function useReactionLabel(emoji: string): string {
  const id = reactionEmojiId(emoji)
  const { name } = useEmojiView(id)
  if (!id) return emoji
  return `:${name ?? FALLBACK_NAME}:`
}

/** Emoji de uma reação: Unicode como texto, personalizado como imagem. */
export default function ReactionEmoji({ emoji }: { emoji: string }): React.JSX.Element {
  const id = reactionEmojiId(emoji)
  const { name } = useEmojiView(id)
  if (!id) return <>{emoji}</>
  return <CustomEmoji id={id} name={name ?? FALLBACK_NAME} size="reaction" />
}

/** De que servidor veio o emoji da reação (só no personalizado, e se ele ainda existe). */
export function ReactionOrigin({ emoji }: { emoji: string }): React.JSX.Element | null {
  const id = reactionEmojiId(emoji)
  const entry = useExpressionOrigin('emoji', id ?? '', id !== null)
  if (!id || !entry?.origin) return null
  return <p className="truncate px-1 pb-1 text-ds-xs text-muted">{originText(entry.origin)}</p>
}
