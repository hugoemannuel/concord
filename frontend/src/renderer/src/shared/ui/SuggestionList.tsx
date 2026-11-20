import type { ReactNode } from 'react'
import { optionId } from '../lib/suggestionNav'

export interface SuggestionListProps<T> {
  /** id do listbox: o campo que abre a lista aponta para ele (suggestionFieldProps). */
  id: string
  /** Nome da lista para o leitor de tela. */
  label: string
  items: T[]
  /** Item destacado, ou -1. */
  highlight: number
  itemKey: (item: T) => string
  onPick: (item: T) => void
  onHighlight: (index: number) => void
  /** Posição e largura (a lista é `absolute` em quem a abre). */
  className?: string
  /** Alinhamento do conteúdo de cada linha. */
  itemClassName?: string
  children: (item: T) => ReactNode
}

/**
 * Lista de sugestões de um campo de texto (@, comandos do "/"). O foco não sai
 * do campo: o teclado muda o destaque (shared/lib/suggestionNav) e o mouse
 * também. Sem itens, não desenha nada.
 */
export default function SuggestionList<T>({
  id,
  label,
  items,
  highlight,
  itemKey,
  onPick,
  onHighlight,
  className = '',
  itemClassName = 'items-center',
  children
}: SuggestionListProps<T>): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <ul
      id={id}
      role="listbox"
      aria-label={label}
      className={`overflow-hidden rounded-lg border border-subtle bg-floating py-1 shadow-2xl ${className}`}
    >
      {items.map((item, i) => (
        <li
          key={itemKey(item)}
          id={optionId(id, i)}
          role="option"
          aria-selected={i === highlight}
          onMouseDown={(e) => {
            // Sem tirar o foco do campo (o blur fecharia a lista).
            e.preventDefault()
            onPick(item)
          }}
          onMouseEnter={() => onHighlight(i)}
          className={`flex cursor-pointer gap-2 px-3 py-1.5 text-ds-sm ${itemClassName} ${
            i === highlight ? 'bg-brand/30 text-strong' : 'text-secondary'
          }`}
        >
          {children(item)}
        </li>
      ))}
    </ul>
  )
}
