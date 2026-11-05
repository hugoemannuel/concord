// Zonas de soltar e transformação do layout no arrasto da barra lateral de servidores.
// Funções puras (sem React), testadas isoladamente.
import { insertionToTarget } from './channelOrder'
import {
  addServerToFolder,
  groupServersIntoFolder,
  moveFolderServer,
  moveTopLevelItem,
  placeServerAtTopLevel,
  type RailLayoutItem
} from './serverRailLayout'

export const RAIL_DRAG_MIME = 'application/x-concord-server-rail'

export type RailDragSource =
  | { kind: 'server'; serverId: string; folderId: string | null }
  | { kind: 'folder'; folderId: string }

export type RailDropZone = 'before' | 'inside' | 'after'

export type RailDropTarget =
  | { scope: 'top'; topIndex: number; zone: RailDropZone; targetId: string }
  | {
      scope: 'folder-member'
      folderId: string
      memberIndex: number
      zone: 'before' | 'after'
      targetId: string
    }

let activeRailDrag: RailDragSource | null = null

export function encodeRailDrag(drag: RailDragSource): string {
  return JSON.stringify(drag)
}

export function decodeRailDrag(raw: string): RailDragSource | null {
  try {
    const parsed = JSON.parse(raw) as Partial<RailDragSource>
    if (parsed?.kind === 'server' && typeof parsed.serverId === 'string') {
      return { kind: 'server', serverId: parsed.serverId, folderId: parsed.folderId ?? null }
    }
    if (parsed?.kind === 'folder' && typeof parsed.folderId === 'string') {
      return { kind: 'folder', folderId: parsed.folderId }
    }
    return null
  } catch {
    return null
  }
}

export function isSameDragSource(a: RailDragSource | null, b: RailDragSource): boolean {
  if (!a || a.kind !== b.kind) return false
  if (a.kind === 'folder' && b.kind === 'folder') return a.folderId === b.folderId
  return a.kind === 'server' && b.kind === 'server' && a.serverId === b.serverId
}

function halfZone(offsetY: number, height: number): 'before' | 'after' {
  return offsetY < height / 2 ? 'before' : 'after'
}

function threeWayZone(offsetY: number, height: number): RailDropZone {
  if (offsetY < height * 0.28) return 'before'
  if (offsetY > height * 0.72) return 'after'
  return 'inside'
}

function isSelfTopTarget(
  drag: RailDragSource,
  target: { kind: 'server' | 'folder'; targetId: string }
): boolean {
  if (drag.kind === 'folder') return target.kind === 'folder' && drag.folderId === target.targetId
  if (target.kind === 'server') return drag.serverId === target.targetId
  return false
}

function resolveMoveIndex(from: number, targetIndex: number, insertion: number): number {
  const raw = insertionToTarget(from, insertion)
  return raw === from && targetIndex !== from ? targetIndex : raw
}

/**
 * Calcula o alvo de soltar quando o ponteiro passa sobre um item do topo
 * (servidor avulso ou pasta).
 */
export function computeTopLevelDrop(
  drag: RailDragSource,
  target: { kind: 'server' | 'folder'; topIndex: number; targetId: string },
  offsetY: number,
  height: number
): RailDropTarget | null {
  if (isSelfTopTarget(drag, target)) return null
  const zone = drag.kind === 'folder' ? halfZone(offsetY, height) : threeWayZone(offsetY, height)
  if (zone === 'inside' && drag.kind === 'server' && target.kind === 'folder' && drag.folderId === target.targetId) {
    return null
  }
  return { scope: 'top', topIndex: target.topIndex, zone, targetId: target.targetId }
}

/** Calcula o alvo quando o ponteiro passa sobre um servidor dentro de uma pasta aberta. */
export function computeFolderMemberDrop(
  drag: RailDragSource,
  folderId: string,
  memberIndex: number,
  targetId: string,
  offsetY: number,
  height: number
): RailDropTarget | null {
  if (drag.kind !== 'server' || drag.serverId === targetId) return null
  const zone = halfZone(offsetY, height)
  return { scope: 'folder-member', folderId, memberIndex, zone, targetId }
}

function applyTopFolderDrop(
  items: readonly RailLayoutItem[],
  folderId: string,
  topIndex: number,
  zone: RailDropZone
): RailLayoutItem[] {
  const from = items.findIndex((i) => i.kind === 'folder' && i.id === folderId)
  if (from < 0) return [...items]
  const insertion = zone === 'before' ? topIndex : topIndex + 1
  return moveTopLevelItem(items, from, resolveMoveIndex(from, topIndex, insertion))
}

function applyTopServerDrop(
  items: readonly RailLayoutItem[],
  serverId: string,
  target: Extract<RailDropTarget, { scope: 'top' }>,
  makeFolderId: () => string
): { items: RailLayoutItem[]; createdFolderId?: string } {
  if (target.zone !== 'inside') {
    const insertion = target.zone === 'before' ? target.topIndex : target.topIndex + 1
    const from = items.findIndex((i) => i.kind === 'server' && i.server_id === serverId)
    if (from >= 0) {
      return { items: moveTopLevelItem(items, from, resolveMoveIndex(from, target.topIndex, insertion)) }
    }
    return { items: placeServerAtTopLevel(items, serverId, insertion) }
  }
  const hit = items[target.topIndex]
  if (hit?.kind === 'folder') {
    return { items: addServerToFolder(items, hit.id, serverId) }
  }
  const createdFolderId = makeFolderId()
  return {
    items: groupServersIntoFolder(items, target.targetId, serverId, createdFolderId),
    createdFolderId
  }
}

function applyFolderMemberServerDrop(
  items: readonly RailLayoutItem[],
  drag: Extract<RailDragSource, { kind: 'server' }>,
  target: Extract<RailDropTarget, { scope: 'folder-member' }>
): RailLayoutItem[] {
  const insertion = target.zone === 'before' ? target.memberIndex : target.memberIndex + 1
  const folder = items.find((i) => i.kind === 'folder' && i.id === target.folderId)
  if (drag.folderId === target.folderId && folder?.kind === 'folder') {
    const from = folder.server_ids.indexOf(drag.serverId)
    if (from < 0) return [...items]
    return moveFolderServer(items, target.folderId, from, resolveMoveIndex(from, target.memberIndex, insertion))
  }
  return addServerToFolder(items, target.folderId, drag.serverId, insertion)
}

/** Aplica o soltar sobre o layout e informa se uma pasta nova acabou de nascer. */
export function applyRailDrop(
  items: readonly RailLayoutItem[],
  drag: RailDragSource,
  target: RailDropTarget,
  makeFolderId: () => string = () => crypto.randomUUID()
): { items: RailLayoutItem[]; createdFolderId?: string } {
  if (target.scope === 'top') {
    if (drag.kind === 'folder') {
      return { items: applyTopFolderDrop(items, drag.folderId, target.topIndex, target.zone) }
    }
    return applyTopServerDrop(items, drag.serverId, target, makeFolderId)
  }
  if (drag.kind !== 'server') return { items: [...items] }
  return { items: applyFolderMemberServerDrop(items, drag, target) }
}

export interface RailDragAdapter {
  drag: RailDragSource | null
  setDrag: (drag: RailDragSource | null) => void
  setDropTarget: (target: RailDropTarget | null) => void
  onFinishDrop: (source: RailDragSource | null, target: RailDropTarget | null) => void
}

function resolveCurrentDrag(e: React.DragEvent<HTMLDivElement>, adapter: RailDragAdapter): RailDragSource | null {
  return adapter.drag ?? activeRailDrag ?? decodeRailDrag(e.dataTransfer.getData(RAIL_DRAG_MIME))
}

/** Cria os tratadores HTML5 de drag-and-drop para um item (topo ou membro de pasta). */
export function buildRailDragHandlers(
  source: RailDragSource,
  computeTarget: (drag: RailDragSource, offsetY: number, height: number) => RailDropTarget | null,
  adapter: RailDragAdapter
): React.HTMLAttributes<HTMLDivElement> & { draggable: boolean } {
  return {
    draggable: true,
    onDragStart: (e) => {
      e.stopPropagation()
      const encoded = encodeRailDrag(source)
      e.dataTransfer.setData(RAIL_DRAG_MIME, encoded)
      e.dataTransfer.setData('text/plain', encoded)
      e.dataTransfer.effectAllowed = 'move'
      activeRailDrag = source
      adapter.setDrag(source)
    },
    onDragEnd: () => {
      activeRailDrag = null
      adapter.setDrag(null)
      adapter.setDropTarget(null)
    },
    onDragOver: (e) => {
      const current = resolveCurrentDrag(e, adapter)
      if (!current) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      const rect = e.currentTarget.getBoundingClientRect()
      adapter.setDropTarget(computeTarget(current, e.clientY - rect.top, rect.height))
    },
    onDrop: (e) => {
      const current = resolveCurrentDrag(e, adapter)
      if (!current) return
      e.preventDefault()
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      const next = computeTarget(current, e.clientY - rect.top, rect.height)
      activeRailDrag = null
      adapter.setDrag(null)
      adapter.setDropTarget(null)
      adapter.onFinishDrop(current, next)
    }
  }
}
