import type { MentionEveryone } from '../../api/messages'
import { messageParts } from '../../lib/linkify'
import type { MentionLabels } from '../../lib/mentions'
import type { MdInline } from '../../lib/markdown/types'
import RichTextParts, { type EmojiSize } from './RichTextParts'
import Spoiler from './Spoiler'

/** O que as folhas de texto precisam para virar links, emojis e menções. */
export interface RichTextOptions {
  everyone: MentionEveryone | null
  mentionLabels?: MentionLabels
  emojiSize: EmojiSize
}

const STYLE_TAG = { bold: 'strong', italic: 'em', underline: 'u', strike: 's' } as const

function InlineNode({ node, opts }: { node: MdInline; opts: RichTextOptions }): React.JSX.Element {
  switch (node.type) {
    case 'text':
    case 'autolink':
      return (
        <RichTextParts
          parts={messageParts(node.text, opts.everyone)}
          mentionLabels={opts.mentionLabels}
          emojiSize={opts.emojiSize}
        />
      )
    case 'code':
      // Literal: nada de link, menção ou emoji dentro.
      return (
        <code className="rounded border border-subtle bg-tertiary px-1 py-0.5 font-mono text-[0.85em]">
          {node.text}
        </code>
      )
    case 'spoiler':
      return (
        <Spoiler>
          <MarkdownInline nodes={node.children} opts={opts} />
        </Spoiler>
      )
    default: {
      const Tag = STYLE_TAG[node.type]
      return (
        <Tag>
          <MarkdownInline nodes={node.children} opts={opts} />
        </Tag>
      )
    }
  }
}

/** Trechos de um bloco: estilos aninhados em elementos React (nada de HTML cru). */
export default function MarkdownInline({
  nodes,
  opts
}: {
  nodes: MdInline[]
  opts: RichTextOptions
}): React.JSX.Element {
  return (
    <>
      {nodes.map((node, i) => (
        <InlineNode key={i} node={node} opts={opts} />
      ))}
    </>
  )
}
