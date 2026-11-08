import { memo, useMemo } from 'react'
import type { MentionEveryone } from '../api/messages'
import { messageParts } from '../lib/linkify'
import { sameLabels, type MentionLabels } from '../lib/mentions'
import { isEmojiOnly } from '../../emojis/lib/emojiToken'
import RichTextParts from './markdown/RichTextParts'

/**
 * Texto da mensagem: menções em chip, links clicáveis e emojis
 * personalizados. É a única parte da linha que dá para selecionar (o app
 * inteiro é select-none); nome, hora e botões continuam fora da seleção.
 *
 * O chip da menção mostra o nome da pessoa (`mentionLabels`), não o @nick; o
 * texto da mensagem continua "@nick".
 *
 * Convite nosso é exceção no clique do link: abre a confirmação no app
 * (useInviteLinkClicks).
 */
function MessageText({
  content,
  everyone,
  mentionLabels
}: {
  content: string
  everyone: MentionEveryone | null
  mentionLabels?: MentionLabels
}): React.JSX.Element {
  // Quebra o texto só quando ele muda (hover e reações re-renderizam a linha).
  const parts = useMemo(() => messageParts(content, everyone), [content, everyone])
  // Só emojis personalizados: grandes, como no Discord.
  const emojiSize = useMemo(() => (isEmojiOnly(parts) ? 'jumbo' : 'inline'), [parts])
  return (
    <p className="cursor-text select-text whitespace-pre-wrap break-words text-ds-chat text-normal">
      <RichTextParts parts={parts} mentionLabels={mentionLabels} emojiSize={emojiSize} />
    </p>
  )
}

export default memo(
  MessageText,
  (a, b) =>
    a.content === b.content &&
    a.everyone === b.everyone &&
    sameLabels(a.mentionLabels, b.mentionLabels)
)
