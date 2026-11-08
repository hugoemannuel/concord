import { parseBlocks } from './parseBlocks'
import type { MdBlock, MdInline, MdList } from './types'

// Texto plano para as prévias de uma linha (resposta, notificação, fixada,
// busca, última mensagem da conversa): só o texto, sem os símbolos, como no
// Discord. O conteúdo do spoiler não vaza na prévia.

// design-allow: máscara do spoiler na prévia de texto, não é ícone
const SPOILER_MASK = '▮▮▮▮'

function inlineText(nodes: MdInline[]): string {
  return nodes
    .map((n) => {
      if (n.type === 'spoiler') return SPOILER_MASK
      return 'children' in n ? inlineText(n.children) : n.text
    })
    .join('')
}

function listText(list: MdList): string[] {
  return list.items.flatMap((item) => [
    inlineText(item.children),
    ...(item.nested ? listText(item.nested) : [])
  ])
}

function blockText(block: MdBlock): string {
  switch (block.type) {
    case 'code':
      return block.text
    case 'quote':
      return blocksText(block.children)
    case 'list':
      return listText(block).join('\n')
    default:
      return inlineText(block.children)
  }
}

const blocksText = (blocks: MdBlock[]): string => blocks.map(blockText).join('\n')

export function stripMarkdown(content: string): string {
  return blocksText(parseBlocks(content))
}

/** Texto da mensagem sem formatação nenhuma (um parágrafo só de texto), ou null. */
export function plainText(blocks: MdBlock[]): string | null {
  const [only] = blocks
  if (blocks.length !== 1 || only.type !== 'paragraph') return null
  const [leaf] = only.children
  return only.children.length === 1 && leaf.type === 'text' ? leaf.text : null
}
