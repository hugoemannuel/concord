import { createContext, useContext, type ReactNode } from 'react'
import type { MemberProfileField } from '../../../../memberProfiles/lib/memberProfile'
import { PencilIcon } from '../../../../../shared/ui/icons'
import SectionHeader from '../../../../../shared/ui/SectionHeader'

// Peças da coluna de personalização (Configurações → Perfis), no jeito do
// Discord: um título pequeno e um controle visual compacto que abre o editor.

/**
 * Modo servidor: o que vai à direita do título de cada bloco ("Herdado" ou
 * "Voltar ao padrão"). Fora dele (perfil global), null.
 */
export const TileAsideContext = createContext<((field: MemberProfileField) => ReactNode) | null>(null)

/** Título pequeno + o conteúdo do bloco. */
export function TileSection({
  title,
  field,
  aside,
  children
}: {
  title: string
  /** O campo do bloco, para o modo servidor mostrar se herda. */
  field?: MemberProfileField
  /** À direita do título (ex.: "Remover"). */
  aside?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  const fieldAside = useContext(TileAsideContext)
  return (
    <section className="min-w-0">
      <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
        <SectionHeader>{title}</SectionHeader>
        {aside ?? (field && fieldAside?.(field))}
      </div>
      {children}
    </section>
  )
}

const TILE =
  'group/tile relative flex min-h-10 min-w-0 cursor-pointer items-center overflow-hidden rounded-xl border border-subtle bg-fg/5 text-left transition-colors hover:border-normal hover:bg-fg/10 focus-ring disabled:cursor-wait disabled:opacity-60'

/** O lápis do canto: sempre à mostra no toque; com mouse, no hover e no foco. */
function TilePencil(): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md bg-black/60 text-white shadow transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/tile:opacity-100 [@media(hover:hover)]:group-focus-visible/tile:opacity-100"
    >
      <PencilIcon className="size-3.5" />
    </span>
  )
}

/** Um bloco clicável (miniatura do avatar, barra de cor, prévia do nome...). */
export function Tile({
  label,
  onClick,
  disabled,
  className = '',
  children
}: {
  /** Nome acessível do que o clique faz ("Alterar avatar"). */
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`${TILE} ${className}`}
    >
      {children}
      <TilePencil />
    </button>
  )
}

/**
 * Linha de texto (pronomes, nota, Sobre mim...): o valor atual ou, vazio, o
 * convite para adicionar.
 */
export function TileRow({
  label,
  value,
  empty,
  onClick
}: {
  label: string
  value: string | null
  empty: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <Tile label={`${label}: ${value ?? empty}`} onClick={onClick} className="w-full px-3 py-2.5 pr-9">
      <span
        className={`line-clamp-2 min-w-0 break-words text-ds-sm ${value ? 'text-normal' : 'italic text-faint'}`}
      >
        {value ?? empty}
      </span>
    </Tile>
  )
}

/** Link pequeno ao lado do título do bloco ("Remover"). */
export function TileAction({
  label,
  onClick,
  disabled,
  children
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="-my-2 min-h-10 cursor-pointer rounded-md px-2 text-ds-xs font-medium text-link hover:underline focus-ring disabled:cursor-wait disabled:opacity-60"
    >
      {children}
    </button>
  )
}
