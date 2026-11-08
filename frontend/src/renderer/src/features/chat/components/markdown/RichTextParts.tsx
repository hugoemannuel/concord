import type { RichPart } from '../../lib/linkify'
import { mentionChipText, type MentionLabels } from '../../lib/mentions'
import MentionChip from '../MentionChip'
import MessageCustomEmoji from '../../../emojis/components/MessageCustomEmoji'

/** Host de verdade do link (em punycode: "аpple.com" cirílico aparece xn--…). */
function hostOf(href: string): string {
  try {
    return new URL(href).host
  } catch {
    return href
  }
}

export type EmojiSize = 'jumbo' | 'inline'

/**
 * Pedaços do texto já quebrados pelo `messageParts`: links clicáveis, emojis
 * personalizados e menções em chip. O chip mostra o nome da pessoa
 * (`mentionLabels`), não o @nick.
 *
 * O link abre no navegador de fora: na web pelo target="_blank"; no app o
 * mesmo target cai no setWindowOpenHandler, que só deixa passar http/https.
 */
export default function RichTextParts({
  parts,
  mentionLabels,
  emojiSize
}: {
  parts: RichPart[]
  mentionLabels?: MentionLabels
  emojiSize: EmojiSize
}): React.JSX.Element {
  return (
    <>
      {parts.map((part, i) =>
        part.href ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            title={hostOf(part.href)}
            // Isolado e sempre da esquerda para a direita: um U+202E antes do
            // link não inverte o endereço na tela.
            dir="ltr"
            style={{ unicodeBidi: 'isolate' }}
            className="text-link hover:underline"
          >
            {part.text}
          </a>
        ) : part.emoji ? (
          <MessageCustomEmoji key={i} id={part.emoji.id} name={part.emoji.name} size={emojiSize} />
        ) : part.mention ? (
          <MentionChip
            key={i}
            mention={part.mention}
            displayText={mentionChipText(part, mentionLabels)}
          />
        ) : (
          part.text
        )
      )}
    </>
  )
}
