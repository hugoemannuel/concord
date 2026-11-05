import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, TrashIcon } from '../../../shared/ui/icons'
import { nextMenuIndex } from '../../../shared/lib/menuNav'
import { commitRailLayout } from '../hooks/useServerRailDrag'
import { clampMenuPosition, observeSize, type MenuPoint } from '../lib/menuPoint'
import { moveTopLevelItem, ungroupFolder, type RailLayoutItem } from '../lib/serverRailLayout'
import { useServerLayoutStore } from '../store/serverLayoutStore'
import { ServerMenuBody } from './ServerRailMenu'
import SidebarMenuItem from './SidebarMenuItem'

export type RailContextTarget =
  | ({ kind: 'server'; serverId: string; name: string } & MenuPoint)
  | ({ kind: 'folder'; folderId: string; name: string } & MenuPoint)

const ICON_CLS = 'h-3.5 w-3.5'

export function FolderMenuBody({
  target,
  items,
  onClose
}: {
  target: Extract<RailContextTarget, { kind: 'folder' }>
  items: RailLayoutItem[]
  onClose: () => void
}): React.JSX.Element {
  const openFolderModal = useServerLayoutStore((s) => s.openFolderModal)
  const topIndex = items.findIndex((i) => i.kind === 'folder' && i.id === target.folderId)

  return (
    <>
      <SidebarMenuItem
        role="menuitem"
        label="Editar pasta"
        icon={<PencilIcon className={ICON_CLS} />}
        onClick={() => {
          onClose()
          openFolderModal({
            mode: 'rename',
            folderId: target.folderId,
            initialName: target.name
          })
        }}
      />
      {topIndex > 0 && (
        <SidebarMenuItem
        role="menuitem"
          label="Mover para cima"
          icon={<ChevronUpIcon className={ICON_CLS} />}
          onClick={() => {
            onClose()
            void commitRailLayout(moveTopLevelItem(items, topIndex, topIndex - 1))
          }}
        />
      )}
      {topIndex >= 0 && topIndex < items.length - 1 && (
        <SidebarMenuItem
        role="menuitem"
          label="Mover para baixo"
          icon={<ChevronDownIcon className={ICON_CLS} />}
          onClick={() => {
            onClose()
            void commitRailLayout(moveTopLevelItem(items, topIndex, topIndex + 1))
          }}
        />
      )}
      <SidebarMenuItem
        role="menuitem"
        label="Desfazer pasta"
        icon={<TrashIcon className={ICON_CLS} />}
        tone="danger"
        onClick={() => {
          onClose()
          void commitRailLayout(ungroupFolder(items, target.folderId))
        }}
      />
    </>
  )
}

/** Os itens do menu em si (não os do submenu aberto): é por eles que as setas andam. */
function ownItems(menu: HTMLElement): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter(
    (el) => el.closest('[role="menu"]') === menu
  )
}

/** Setas, Home e End movem o foco entre os itens do menu. */
function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
  const list = ownItems(e.currentTarget)
  const next = nextMenuIndex(list.indexOf(document.activeElement as HTMLElement), list.length, e.key)
  if (next === null) return
  e.preventDefault()
  list[next]?.focus()
}

/**
 * Posição que cabe na tela (mede o menu depois de pintado e de novo quando o
 * conteúdo muda, ex.: as permissões chegaram) e foco no primeiro item. Ao
 * fechar, o foco volta a quem o tinha (o ícone, no teclado).
 */
function useMenuPlacement(
  target: RailContextTarget | null,
  menuRef: React.RefObject<HTMLDivElement | null>
): MenuPoint | null {
  const [pos, setPos] = useState<MenuPoint | null>(null)
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!target || !menu) return
    const opener = document.activeElement as HTMLElement | null
    const place = (): void => {
      const { width, height } = menu.getBoundingClientRect()
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      setPos(clampMenuPosition(target, { width, height }, viewport))
    }
    place()
    ownItems(menu)[0]?.focus()
    const stop = observeSize(menu, place)
    return () => {
      stop()
      setPos(null)
      opener?.focus?.()
    }
  }, [target, menuRef])
  return pos
}

/** Fecha com Esc (se um submenu não tratou antes), ao redimensionar ou rolar fora do menu. */
function useMenuDismiss(
  target: RailContextTarget | null,
  menuRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void
): void {
  useEffect(() => {
    if (!target) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    // A lista do submenu rola por dentro: só o resto da tela fecha o menu.
    const onScroll = (e: Event): void => {
      if (!menuRef.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [target, menuRef, onClose])
}

/** Menu de contexto (botão direito, segurar o dedo ou tecla de menu) de um servidor ou de uma pasta do trilho. */
function ServerRailContextMenu({
  target,
  items,
  onClose
}: {
  target: RailContextTarget | null
  items: RailLayoutItem[]
  onClose: () => void
}): React.JSX.Element | null {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const pos = useMenuPlacement(target, menuRef)
  useMenuDismiss(target, menuRef, onClose)

  if (!target) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[80]"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        ref={menuRef}
        role="menu"
        aria-label={target.name}
        // A 1ª passada (0, 0) é medida e reposicionada antes da pintura (useLayoutEffect); nada de
        // visibility: hidden, que impediria o foco no primeiro item.
        style={{ left: pos?.x ?? 0, top: pos?.y ?? 0 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onMenuKeyDown}
        className="fixed flex max-h-[calc(100dvh-1rem)] w-60 max-w-[calc(100vw-1rem)] flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-xl border border-subtle bg-floating p-1.5 shadow-2xl"
      >
        {target.kind === 'server' ? (
          <ServerMenuBody serverId={target.serverId} items={items} onClose={onClose} />
        ) : (
          <FolderMenuBody target={target} items={items} onClose={onClose} />
        )}
      </div>
    </div>,
    document.body
  )
}

export default ServerRailContextMenu
