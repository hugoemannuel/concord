import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  TrashIcon
} from '../../../shared/ui/icons'
import { useNotifySettingsStore } from '../../notifications/store/notifySettingsStore'
import { commitRailLayout } from '../hooks/useServerRailDrag'
import {
  addServerToFolder,
  findServerFolder,
  moveFolderServer,
  moveTopLevelItem,
  placeServerAtTopLevel,
  ungroupFolder,
  type RailFolderEntry,
  type RailLayoutItem
} from '../lib/serverRailLayout'
import { useServerLayoutStore } from '../store/serverLayoutStore'
import { FolderGlyph } from './ServerFolderItem'
import SidebarMenuItem from './SidebarMenuItem'

export type RailContextTarget =
  | { kind: 'server'; serverId: string; name: string; x: number; y: number }
  | { kind: 'folder'; folderId: string; name: string; x: number; y: number }

const ICON_CLS = 'h-3.5 w-3.5'

function listFolders(items: readonly RailLayoutItem[]): RailFolderEntry[] {
  return items.filter((i): i is RailFolderEntry => i.kind === 'folder')
}

export function ServerMenuBody({
  target,
  items,
  onClose
}: {
  target: Extract<RailContextTarget, { kind: 'server' }>
  items: RailLayoutItem[]
  onClose: () => void
}): React.JSX.Element {
  const openNotifyModal = useNotifySettingsStore((s) => s.openModal)
  const openFolderModal = useServerLayoutStore((s) => s.openFolderModal)
  const currentFolder = findServerFolder(items, target.serverId)
  const folders = listFolders(items).filter((f) => f.id !== currentFolder?.id)
  const topIndex = items.findIndex((i) => i.kind === 'server' && i.server_id === target.serverId)
  const memberIndex = currentFolder ? currentFolder.server_ids.indexOf(target.serverId) : -1
  const canMoveUp = currentFolder ? memberIndex > 0 : topIndex > 0
  const canMoveDown = currentFolder
    ? memberIndex >= 0 && memberIndex < currentFolder.server_ids.length - 1
    : topIndex >= 0 && topIndex < items.length - 1

  const moveStep = (delta: -1 | 1): void => {
    if (currentFolder) {
      void commitRailLayout(
        moveFolderServer(items, currentFolder.id, memberIndex, memberIndex + delta)
      )
    } else {
      void commitRailLayout(moveTopLevelItem(items, topIndex, topIndex + delta))
    }
    onClose()
  }

  return (
    <>
      <SidebarMenuItem
        label="Notificações do servidor"
        onClick={() => {
          onClose()
          openNotifyModal({ serverId: target.serverId, name: target.name })
        }}
      />
      <SidebarMenuItem
        label="Criar pasta"
        icon={<FolderGlyph className={ICON_CLS} />}
        onClick={() => {
          onClose()
          openFolderModal({ mode: 'create', initialServerIds: [target.serverId] })
        }}
      />
      {folders.map((f) => (
        <SidebarMenuItem
          key={f.id}
          label={`Mover para ${f.name}`}
          icon={<FolderGlyph className={ICON_CLS} />}
          onClick={() => {
            onClose()
            void commitRailLayout(addServerToFolder(items, f.id, target.serverId))
          }}
        />
      ))}
      {currentFolder && (
        <SidebarMenuItem
          label="Tirar da pasta"
          onClick={() => {
            onClose()
            const folderTopIdx = items.findIndex(
              (i) => i.kind === 'folder' && i.id === currentFolder.id
            )
            void commitRailLayout(placeServerAtTopLevel(items, target.serverId, folderTopIdx + 1))
          }}
        />
      )}
      {canMoveUp && (
        <SidebarMenuItem
          label="Mover para cima"
          icon={<ChevronUpIcon className={ICON_CLS} />}
          onClick={() => moveStep(-1)}
        />
      )}
      {canMoveDown && (
        <SidebarMenuItem
          label="Mover para baixo"
          icon={<ChevronDownIcon className={ICON_CLS} />}
          onClick={() => moveStep(1)}
        />
      )}
    </>
  )
}

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
          label="Mover para baixo"
          icon={<ChevronDownIcon className={ICON_CLS} />}
          onClick={() => {
            onClose()
            void commitRailLayout(moveTopLevelItem(items, topIndex, topIndex + 1))
          }}
        />
      )}
      <SidebarMenuItem
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

/** Menu de contexto (botão direito) de um servidor ou de uma pasta na barra lateral. */
function ServerRailContextMenu({
  target,
  items,
  onClose
}: {
  target: RailContextTarget | null
  items: RailLayoutItem[]
  onClose: () => void
}): React.JSX.Element | null {
  useEffect(() => {
    if (!target) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [target, onClose])

  if (!target) return null

  return createPortal(
    <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}>
      <div
        role="menu"
        style={{
          left: `min(${target.x}px, calc(100vw - 14rem))`,
          top: `min(${target.y}px, calc(100vh - 14rem))`
        }}
        onClick={(e) => e.stopPropagation()}
        className="fixed flex w-52 max-w-[calc(100vw-1rem)] flex-col rounded-xl border border-subtle bg-floating p-1.5 shadow-2xl backdrop-blur-xl"
      >
        {target.kind === 'server' ? (
          <ServerMenuBody target={target} items={items} onClose={onClose} />
        ) : (
          <FolderMenuBody target={target} items={items} onClose={onClose} />
        )}
      </div>
    </div>,
    document.body
  )
}

export default ServerRailContextMenu
