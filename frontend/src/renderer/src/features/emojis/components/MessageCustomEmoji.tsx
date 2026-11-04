import { useState } from 'react'
import { useEmojiView } from '../hooks/useEmojiView'
import CustomEmoji, { type CustomEmojiSize } from './CustomEmoji'
import ExpressionOriginCard from './ExpressionOriginCard'

/** Emoji no texto da mensagem: clicar mostra de que servidor ele veio. */
export default function MessageCustomEmoji({
  id,
  name,
  size
}: {
  id: string
  name: string
  size: CustomEmojiSize
}): React.JSX.Element {
  const { visible } = useEmojiView(id)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  if (!visible) return <CustomEmoji id={id} name={name} size={size} />
  return (
    <>
      <button
        type="button"
        aria-label={`:${name}:`}
        aria-haspopup="dialog"
        data-message-media
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className="focus-ring inline cursor-pointer rounded align-baseline"
      >
        <CustomEmoji id={id} name={name} size={size} />
      </button>
      {anchor && (
        <ExpressionOriginCard
          kind="emoji"
          id={id}
          name={name}
          media={<CustomEmoji id={id} name={name} size="picker" />}
          anchor={anchor}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  )
}
