// Árvore do Markdown das mensagens (regras do Discord). O texto fica cru no
// banco; quem formata é a tela. Só elementos React: nada de HTML cru.

export type MdStyle = 'bold' | 'italic' | 'underline' | 'strike' | 'spoiler'

export type MdInline =
  /** Texto comum: ainda passa por links, emojis e menções na hora de desenhar. */
  | { type: 'text'; text: string }
  /** Código no meio da frase: literal. */
  | { type: 'code'; text: string }
  /** `<https://…>`: link sem os sinais e sem prévia. */
  | { type: 'autolink'; text: string }
  | { type: MdStyle; children: MdInline[] }

export interface MdListItem {
  children: MdInline[]
  /** Um nível de aninhamento (recuo de 2+ espaços). */
  nested: MdList | null
}

export interface MdList {
  type: 'list'
  ordered: boolean
  /** Número do primeiro item da lista ordenada. */
  start: number
  items: MdListItem[]
}

export type MdBlock =
  /** Bloco de código: literal; a linguagem é aceita e ignorada no desenho. */
  | { type: 'code'; text: string; lang: string }
  | { type: 'quote'; children: MdBlock[] }
  | { type: 'heading'; level: 1 | 2 | 3; children: MdInline[] }
  | MdList
  | { type: 'subtext'; children: MdInline[] }
  | { type: 'paragraph'; children: MdInline[] }
