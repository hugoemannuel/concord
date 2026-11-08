import type { MdBlock, MdList } from '../../lib/markdown/types'
import CodeBlock from './CodeBlock'
import MarkdownInline, { type RichTextOptions } from './MarkdownInline'

/** Três tamanhos de título a partir da escala de texto. */
const HEADINGS = {
  1: { Tag: 'h1', size: 'text-ds-xl' },
  2: { Tag: 'h2', size: 'text-ds-lg' },
  3: { Tag: 'h3', size: 'text-ds-md' }
} as const

function ListBlock({
  list,
  opts,
  nested = false
}: {
  list: MdList
  opts: RichTextOptions
  nested?: boolean
}): React.JSX.Element {
  const Tag = list.ordered ? 'ol' : 'ul'
  const marker = list.ordered ? 'list-decimal' : nested ? 'list-[circle]' : 'list-disc'
  return (
    <Tag start={list.ordered ? list.start : undefined} className={`pl-6 ${marker}`}>
      {list.items.map((item, i) => (
        <li key={i}>
          <MarkdownInline nodes={item.children} opts={opts} />
          {item.nested && <ListBlock list={item.nested} opts={opts} nested />}
        </li>
      ))}
    </Tag>
  )
}

function Block({ block, opts }: { block: MdBlock; opts: RichTextOptions }): React.JSX.Element {
  switch (block.type) {
    case 'code':
      return <CodeBlock text={block.text} />
    case 'quote':
      return (
        <blockquote className="my-0.5 border-l-4 border-normal pl-3">
          <MarkdownBlocks blocks={block.children} opts={opts} />
        </blockquote>
      )
    case 'list':
      return <ListBlock list={block} opts={opts} />
    case 'heading': {
      const { Tag, size } = HEADINGS[block.level]
      return (
        <Tag className={`mb-1 mt-2 font-bold leading-tight text-strong first:mt-0 ${size}`}>
          <MarkdownInline nodes={block.children} opts={opts} />
        </Tag>
      )
    }
    case 'subtext':
      return (
        <small className="block text-ds-xs text-muted">
          <MarkdownInline nodes={block.children} opts={opts} />
        </small>
      )
    case 'paragraph':
      return (
        <p className="whitespace-pre-wrap">
          <MarkdownInline nodes={block.children} opts={opts} />
        </p>
      )
  }
}

/** Blocos da mensagem (código, citação, títulos, listas, subtexto, parágrafo). */
export default function MarkdownBlocks({
  blocks,
  opts
}: {
  blocks: MdBlock[]
  opts: RichTextOptions
}): React.JSX.Element {
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} block={block} opts={opts} />
      ))}
    </>
  )
}
