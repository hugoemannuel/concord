import { useState } from 'react'
import { showToast } from '../../../shared/store/toastStore'
import {
  applyRailDrop,
  buildRailDragHandlers,
  computeFolderMemberDrop,
  computeTopLevelDrop,
  isSameDragSource,
  type RailDragSource,
  type RailDropTarget,
  type RailDropZone
} from '../lib/serverRailDrop'
import { DEFAULT_FOLDER_NAME, type RailLayoutItem } from '../lib/serverRailLayout'
import { useServerLayoutStore } from '../store/serverLayoutStore'

export async function commitRailLayout(nextItems: RailLayoutItem[]): Promise<void> {
  try {
    await useServerLayoutStore.getState().saveLayout(nextItems)
  } catch {
    showToast.error('Não foi possível salvar a ordem dos servidores.')
  }
}

export function executeRailDrop(
  reconciledItems: RailLayoutItem[],
  source: RailDragSource | null,
  target: RailDropTarget | null
): void {
  if (!source || !target) return
  const { items, createdFolderId } = applyRailDrop(reconciledItems, source, target)
  if (createdFolderId) {
    const store = useServerLayoutStore.getState()
    store.setFolderCollapsed(createdFolderId, false)
    store.openFolderModal({
      mode: 'rename',
      folderId: createdFolderId,
      initialName: DEFAULT_FOLDER_NAME
    })
  }
  void commitRailLayout(items)
}

export interface ServerRailDrag {
  isDragging: (source: RailDragSource) => boolean
  topZone: (topIndex: number) => RailDropZone | null
  folderMemberZone: (folderId: string, memberIndex: number) => RailDropZone | null
  topDragProps: (
    source: RailDragSource,
    target: { kind: 'server' | 'folder'; topIndex: number; targetId: string }
  ) => React.HTMLAttributes<HTMLDivElement> & { draggable: boolean }
  folderMemberDragProps: (
    folderId: string,
    memberIndex: number,
    serverId: string
  ) => React.HTMLAttributes<HTMLDivElement> & { draggable: boolean }
  clearOnLeave: (e: React.DragEvent<HTMLElement>) => void
}

/** Liga o arrastar e soltar dos servidores e pastas na barra lateral. */
export function useServerRailDrag(reconciledItems: RailLayoutItem[]): ServerRailDrag {
  const [drag, setDrag] = useState<RailDragSource | null>(null)
  const [dropTarget, setDropTarget] = useState<RailDropTarget | null>(null)

  const adapter = {
    drag,
    setDrag,
    setDropTarget,
    onFinishDrop: (source: RailDragSource | null, target: RailDropTarget | null) =>
      executeRailDrop(reconciledItems, source, target)
  }

  return {
    isDragging: (source) => isSameDragSource(drag, source),
    topZone: (topIndex) =>
      dropTarget?.scope === 'top' && dropTarget.topIndex === topIndex ? dropTarget.zone : null,
    folderMemberZone: (folderId, memberIndex) =>
      dropTarget?.scope === 'folder-member' &&
      dropTarget.folderId === folderId &&
      dropTarget.memberIndex === memberIndex
        ? dropTarget.zone
        : null,
    topDragProps: (source, target) =>
      buildRailDragHandlers(
        source,
        (d, y, h) => computeTopLevelDrop(d, target, y, h),
        adapter
      ),
    folderMemberDragProps: (folderId, memberIndex, serverId) =>
      buildRailDragHandlers(
        { kind: 'server', serverId, folderId },
        (d, y, h) => computeFolderMemberDrop(d, folderId, memberIndex, serverId, y, h),
        adapter
      ),
    clearOnLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null)
    }
  }
}
