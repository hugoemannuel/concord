import { createPortal } from 'react-dom'
import type { SidebarDrag } from '../lib/sidebarDrop'
import { ChevronDownIcon, VolumeIcon } from '../../../shared/ui/icons'

const MAX_NAMES = 4

/** Categoria arrastada: o fantasma mostra os canais, porque eles vão junto. */
function CategoryContents({ names }: { names: string[] }): React.JSX.Element {
  const hidden = names.length - MAX_NAMES
  return (
    <ul className="mt-1 space-y-0.5 pl-6 text-ds-xs font-normal text-muted">
      {names.slice(0, MAX_NAMES).map((name) => <li key={name} className="truncate">{name}</li>)}
      {hidden > 0 && <li>+{hidden}</li>}
    </ul>
  )
}

function GhostIcon({ drag }: { drag: SidebarDrag }): React.JSX.Element {
  if (drag.kind === 'category') return <ChevronDownIcon size={16} />
  if (drag.type === 'voice') return <VolumeIcon size={16} />
  return <span className="flex w-4 justify-center text-ds-md leading-none text-faint">#</span>
}

/** O item seguindo o ponteiro. Fica no body: a barra tem backdrop-filter, que prenderia o `fixed`. */
export function SidebarDragGhost({ drag, title, names, attach }: {
  drag: SidebarDrag
  title: string
  /** Canais da categoria arrastada. */
  names: string[]
  attach: (element: HTMLElement | null) => void
}): React.JSX.Element {
  return createPortal(
    <div
      ref={attach}
      aria-hidden
      data-testid="sidebar-drag-ghost"
      className="pointer-events-none fixed left-0 top-0 z-50 w-56 max-w-[70vw] rounded-lg border border-subtle bg-floating p-2 text-ds-sm font-medium text-strong shadow-2xl"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex shrink-0 text-muted"><GhostIcon drag={drag} /></span>
        <span className="truncate">{title}</span>
      </div>
      {drag.kind === 'category' && names.length > 0 && <CategoryContents names={names} />}
    </div>,
    document.body
  )
}
