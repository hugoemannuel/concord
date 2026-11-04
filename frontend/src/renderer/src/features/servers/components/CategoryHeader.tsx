import { useEffect, useRef, useState } from 'react'
import type { Category } from '../api/categories'
import Button from '../../../shared/ui/Button'
import IconButton from '../../../shared/ui/IconButton'
import { ChevronDownIcon, ChevronRightIcon, DotsIcon } from '../../../shared/ui/icons'
import SidebarMenuItem from './SidebarMenuItem'

export function CategoryHeader({ category, collapsed, canManage, canMoveUp, canMoveDown, dragProps, onToggle, onCollapseAll, onEdit, onDelete, onMove, onCreateChannel }: {
  category: Category
  collapsed: boolean
  canManage: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  /** Arrastar a categoria inteira (só para quem gerencia canais). */
  dragProps: React.HTMLAttributes<HTMLDivElement>
  onToggle: () => void
  onCollapseAll: () => void
  onEdit: () => void
  onDelete: () => void
  onMove: (direction: 'up' | 'down') => void
  onCreateChannel: () => void
}): React.JSX.Element {
  const [menu, setMenu] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const closeOutside = (event: PointerEvent): void => {
      if (!host.current?.contains(event.target as Node)) setMenu(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [menu])
  const pick = (action: () => void): void => { setMenu(false); action() }
  return (
    <div ref={host} {...dragProps} className={`relative flex items-center ${canManage ? 'select-none [-webkit-touch-callout:none]' : ''}`}
      onContextMenu={(event) => { event.preventDefault(); setMenu(true) }}>
      <Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-start border-transparent" aria-expanded={!collapsed} onClick={onToggle} icon={collapsed ? ChevronRightIcon : ChevronDownIcon}>
        <span className="truncate">{category.name}</span>
      </Button>
      <IconButton icon={DotsIcon} label={`Opções da categoria ${category.name}`} size="md" data-no-drag aria-expanded={menu} onClick={() => setMenu(!menu)} />
      {menu && (
        <div data-no-drag onKeyDown={(event) => { if (event.key === 'Escape') setMenu(false) }} className="absolute right-0 top-full z-30 flex w-52 max-w-full flex-col rounded-xl border border-subtle bg-floating p-1.5 shadow-2xl">
          <SidebarMenuItem label={collapsed ? 'Expandir categoria' : 'Recolher categoria'} onClick={() => pick(onToggle)} />
          <SidebarMenuItem label="Recolher todas as categorias" onClick={() => pick(onCollapseAll)} />
          {canManage && <>
            <SidebarMenuItem label="Criar canal" onClick={() => pick(onCreateChannel)} />
            {canMoveUp && <SidebarMenuItem label="Mover para cima" onClick={() => pick(() => onMove('up'))} />}
            {canMoveDown && <SidebarMenuItem label="Mover para baixo" onClick={() => pick(() => onMove('down'))} />}
            <SidebarMenuItem label="Editar categoria" onClick={() => pick(onEdit)} />
            <SidebarMenuItem label="Excluir categoria" tone="danger" onClick={() => pick(onDelete)} />
          </>}
        </div>
      )}
    </div>
  )
}
