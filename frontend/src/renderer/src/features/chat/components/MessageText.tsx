import { memo, useMemo } from 'react'
import type { MentionEveryone, RoleMention } from '../api/messages'
import { messageParts } from '../lib/linkify'
import { parseBlocks } from '../lib/markdown/parseBlocks'
import { plainText } from '../lib/markdown/stripMarkdown'
import { sameLabels, type MentionLabels } from '../lib/mentions'
import { isEmojiOnly } from '../../emojis/lib/emojiToken'
import MarkdownBlocks from './markdown/MarkdownBlocks'

/**
 * Texto da mensagem com a formatação Markdown do Discord (negrito, código,
 * citação, listas, spoiler…), menções em chip, links clicáveis e emojis
 * personalizados. O texto fica cru no banco; quem formata é aqui. É a única
 * parte da linha que dá para selecionar (o app inteiro é select-none); nome,
 * hora e botões continuam fora da seleção.
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
  mentionRoles,
  mentionLabels
}: {
  content: string
  everyone: MentionEveryone | null
  /** Cargos que a mensagem pingou (mention_roles): viram chip de cargo. */
  mentionRoles?: readonly RoleMention[] | null
  mentionLabels?: MentionLabels
}): React.JSX.Element {
  // Analisa o texto só quando ele muda (hover e reações re-renderizam a linha).
  const blocks = useMemo(() => parseBlocks(content), [content])
  // Só emojis personalizados e nenhuma formatação: grandes, como no Discord.
  const emojiSize = useMemo(() => {
    const plain = plainText(blocks)
    return plain !== null && isEmojiOnly(messageParts(plain, everyone)) ? 'jumbo' : 'inline'
  }, [blocks, everyone])
  return (
    <div className="min-w-0 cursor-text select-text break-words text-ds-chat text-normal">
      <MarkdownBlocks
        blocks={blocks}
        opts={{ everyone, mentionRoles: mentionRoles ?? undefined, mentionLabels, emojiSize }}
      />
    </div>
  )
}

export default memo(
  MessageText,
  (a, b) =>
    a.content === b.content &&
    a.everyone === b.everyone &&
    a.mentionRoles === b.mentionRoles &&
    sameLabels(a.mentionLabels, b.mentionLabels)
)
