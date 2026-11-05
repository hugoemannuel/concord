import { useCallback, useEffect, useRef, useState } from 'react'
import type { Category } from '../api/categories'
import Button from '../../../shared/ui/Button'
import IconButton from '../../../shared/ui/IconButton'
import { ChevronDownIcon, ChevronRightIcon, DotsIcon, LockIcon, PlusIcon } from '../../../shared/ui/icons'
import SidebarMenuItem from './SidebarMenuItem'

interface CategoryMenuActions {
  onToggle: () => void
  onCollapseAll: () => void
  onEdit: () => void
  onPermissions: () => void
  onDelete: () => void
  onMove: (direction: 'up' | 'down') => void
  onCreateChannel: () => void
}

interface CategoryMenuProps extends CategoryMenuActions {
  collapsed: boolean
  canManage: boolean
  /** Mexer em quem vê exige também gerenciar cargos. */
  canManageRoles: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  /** Fecha o menu antes de executar a ação. */
  pick: (action: () => void) => void
}

/** Menu da categoria: "Mover para cima/baixo" é a alternativa ao arrastar, com teclado e toque. */
export function CategoryMenu({ collapsed, canManage, canManageRoles, canMoveUp, canMoveDown, pick, onToggle, onCollapseAll, onCreateChannel, onMove, onEdit, onPermissions, onDelete }: CategoryMenuProps): React.JSX.Element {
  return (
    <>
      <SidebarMenuItem label={collapsed ? 'Expandir categoria' : 'Recolher categoria'} onClick={() => pick(onToggle)} />
      <SidebarMenuItem label="Recolher todas as categorias" onClick={() => pick(onCollapseAll)} />
      {canManage && <>
        <SidebarMenuItem label="Criar canal" onClick={() => pick(onCreateChannel)} />
        {canMoveUp && <SidebarMenuItem label="Mover para cima" onClick={() => pick(() => onMove('up'))} />}
        {canMoveDown && <SidebarMenuItem label="Mover para baixo" onClick={() => pick(() => onMove('down'))} />}
        <SidebarMenuItem label="Editar categoria" onClick={() => pick(onEdit)} />
        {canManageRoles && <SidebarMenuItem label="Permissões da categoria" onClick={() => pick(onPermissions)} />}
        <SidebarMenuItem label="Excluir categoria" tone="danger" onClick={() => pick(onDelete)} />
      </>}
    </>
  )
}

/** Fecha o menu ao tocar fora dele. */
function useCloseOutside(open: boolean, close: () => void): React.RefObject<HTMLDivElement | null> {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent): void => {
      if (!host.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open, close])
  return host
}

export function CategoryHeader({ category, isPrivate, dragProps, ...menuProps }: Omit<CategoryMenuProps, 'pick'> & {
  category: Category
  isPrivate?: boolean
  /** Arrastar a categoria inteira (só para quem gerencia canais). */
  dragProps: React.HTMLAttributes<HTMLDivElement>
}): React.JSX.Element {
  const { collapsed, canManage, onToggle, onCreateChannel } = menuProps
  const [menu, setMenu] = useState(false)
  const close = useCallback(() => setMenu(false), [])
  const host = useCloseOutside(menu, close)
  const pick = (action: () => void): void => { setMenu(false); action() }
  return (
    <div ref={host} data-sidebar-item {...dragProps} className={`relative flex items-center ${canManage ? 'select-none [-webkit-touch-callout:none]' : ''}`}
      onContextMenu={(event) => { event.preventDefault(); setMenu(true) }}>
      <Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-start border-transparent" aria-expanded={!collapsed} onClick={onToggle} icon={collapsed ? ChevronRightIcon : ChevronDownIcon}>
        <span className="truncate">{category.name}</span>
        {isPrivate && (
          <span title="Categoria privada" className="ml-1.5 inline-flex shrink-0 text-faint">
            <LockIcon className="h-3 w-3" />
            <span className="sr-only">(categoria privada)</span>
          </span>
        )}
      </Button>
      {canManage && <IconButton icon={PlusIcon} label={`Criar canal em ${category.name}`} size="md" data-no-drag onClick={onCreateChannel} />}
      <IconButton icon={DotsIcon} label={`Opções da categoria ${category.name}`} size="md" data-no-drag aria-expanded={menu} onClick={() => setMenu(!menu)} />
      {menu && (
        <div data-no-drag onKeyDown={(event) => { if (event.key === 'Escape') setMenu(false) }} className="absolute right-0 top-full z-30 flex w-52 max-w-full flex-col rounded-xl border border-subtle bg-floating p-1.5 shadow-2xl">
          <CategoryMenu {...menuProps} pick={pick} />
        </div>
      )}
    </div>
  )
}
