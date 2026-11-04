// Organização privada da barra lateral de servidores: ordem dos servidores e
// pastas/grupos com nome editável. Puro, sem React.
import type { Server } from '../api/servers'
import { moveItem } from './channelOrder'
import type { ServerRailView } from './serverRailView'

export const DEFAULT_FOLDER_NAME = 'Pasta de servidores'
export const MAX_FOLDER_NAME_LENGTH = 40

export interface RailServerEntry {
  kind: 'server'
  server_id: string
}

export interface RailFolderEntry {
  kind: 'folder'
  id: string
  name: string
  server_ids: string[]
}

export type RailLayoutItem = RailServerEntry | RailFolderEntry

export interface ResolvedRailServer {
  kind: 'server'
  server: Server
}

export interface ResolvedRailFolder {
  kind: 'folder'
  id: string
  name: string
  servers: Server[]
}

export type ResolvedRailEntry = ResolvedRailServer | ResolvedRailFolder

/** Limpa espaços e aplica o nome padrão e o limite de 40 caracteres. */
export function normalizeFolderName(name?: string): string {
  const trimmed = (name ?? '').trim().slice(0, MAX_FOLDER_NAME_LENGTH)
  return trimmed || DEFAULT_FOLDER_NAME
}

function takeUnseenAllowed(
  ids: readonly string[],
  allowed: Set<string>,
  placed: Set<string>
): string[] {
  const out: string[] = []
  for (const id of ids) {
    if (allowed.has(id) && !placed.has(id)) {
      placed.add(id)
      out.push(id)
    }
  }
  return out
}

function reconcileSingleItem(
  item: RailLayoutItem,
  allowed: Set<string>,
  placed: Set<string>
): RailLayoutItem | null {
  if (item.kind === 'server') {
    if (!allowed.has(item.server_id) || placed.has(item.server_id)) return null
    placed.add(item.server_id)
    return { kind: 'server', server_id: item.server_id }
  }
  const members = takeUnseenAllowed(item.server_ids, allowed, placed)
  if (members.length === 0) return null
  return {
    kind: 'folder',
    id: item.id.trim(),
    name: normalizeFolderName(item.name),
    server_ids: members
  }
}

/**
 * Reconcilia o layout salvo com os servidores atuais da pessoa: descarta os que
 * não existem mais, tira duplicatas, some com pastas vazias e põe os novos no fim.
 */
export function reconcileRailLayout(
  items: readonly RailLayoutItem[],
  servers: readonly { id: string }[]
): RailLayoutItem[] {
  const allowed = new Set(servers.map((s) => s.id))
  const placed = new Set<string>()
  const out: RailLayoutItem[] = []
  for (const item of items) {
    const clean = reconcileSingleItem(item, allowed, placed)
    if (clean) out.push(clean)
  }
  for (const srv of servers) {
    if (!placed.has(srv.id)) out.push({ kind: 'server', server_id: srv.id })
  }
  return out
}

/** Converte o layout em entradas prontas para a barra lateral desenhar. */
export function resolveRailEntries(
  items: readonly RailLayoutItem[],
  servers: readonly Server[]
): ResolvedRailEntry[] {
  const byId = new Map(servers.map((s) => [s.id, s]))
  const reconciled = reconcileRailLayout(items, servers)
  return reconciled.map((item): ResolvedRailEntry => {
    if (item.kind === 'server') {
      return { kind: 'server', server: byId.get(item.server_id)! }
    }
    return {
      kind: 'folder',
      id: item.id,
      name: item.name,
      servers: item.server_ids.map((id) => byId.get(id)!)
    }
  })
}

/** Tira um servidor de onde estiver (topo ou pasta) e apaga pasta que esvaziar. */
export function removeServerFromLayout(
  items: readonly RailLayoutItem[],
  serverId: string
): RailLayoutItem[] {
  const out: RailLayoutItem[] = []
  for (const item of items) {
    if (item.kind === 'server') {
      if (item.server_id !== serverId) out.push(item)
      continue
    }
    const filtered = item.server_ids.filter((id) => id !== serverId)
    if (filtered.length > 0) out.push({ ...item, server_ids: filtered })
  }
  return out
}

/** Pasta em que o servidor está, ou null se ele está solto no topo. */
export function findServerFolder(
  items: readonly RailLayoutItem[],
  serverId: string
): RailFolderEntry | null {
  for (const item of items) {
    if (item.kind === 'folder' && item.server_ids.includes(serverId)) return item
  }
  return null
}

/** Move uma entrada do topo (servidor avulso ou pasta inteira) de `from` para `to`. */
export function moveTopLevelItem(
  items: readonly RailLayoutItem[],
  from: number,
  to: number
): RailLayoutItem[] {
  return moveItem(items, from, to)
}

/** Coloca um servidor (vindo do topo ou de dentro de uma pasta) na posição `insertion` do topo. */
export function placeServerAtTopLevel(
  items: readonly RailLayoutItem[],
  serverId: string,
  insertion: number
): RailLayoutItem[] {
  const topIdx = items.findIndex((i) => i.kind === 'server' && i.server_id === serverId)
  const target = topIdx >= 0 && insertion > topIdx ? insertion - 1 : insertion
  const without = removeServerFromLayout(items, serverId)
  const clamped = Math.max(0, Math.min(without.length, target))
  const next = [...without]
  next.splice(clamped, 0, { kind: 'server', server_id: serverId })
  return next
}

/**
 * Cria uma pasta nova no lugar de `targetServerId` contendo `[targetServerId, draggedServerId]`.
 */
export function groupServersIntoFolder(
  items: readonly RailLayoutItem[],
  targetServerId: string,
  draggedServerId: string,
  folderId: string,
  folderName?: string
): RailLayoutItem[] {
  if (targetServerId === draggedServerId) return [...items]
  const withoutDragged = removeServerFromLayout(items, draggedServerId)
  const folder: RailFolderEntry = {
    kind: 'folder',
    id: folderId,
    name: normalizeFolderName(folderName),
    server_ids: [targetServerId, draggedServerId]
  }
  return withoutDragged.map((item) =>
    item.kind === 'server' && item.server_id === targetServerId ? folder : item
  )
}

/** Move `serverId` para dentro da pasta `folderId` na posição `index` (ou no fim). */
export function addServerToFolder(
  items: readonly RailLayoutItem[],
  folderId: string,
  serverId: string,
  index?: number
): RailLayoutItem[] {
  const without = removeServerFromLayout(items, serverId)
  return without.map((item) => {
    if (item.kind !== 'folder' || item.id !== folderId) return item
    const nextIds = [...item.server_ids]
    const pos = index === undefined ? nextIds.length : Math.max(0, Math.min(nextIds.length, index))
    nextIds.splice(pos, 0, serverId)
    return { ...item, server_ids: nextIds }
  })
}

/** Reordena um servidor dentro da mesma pasta. */
export function moveFolderServer(
  items: readonly RailLayoutItem[],
  folderId: string,
  from: number,
  to: number
): RailLayoutItem[] {
  return items.map((item) =>
    item.kind === 'folder' && item.id === folderId
      ? { ...item, server_ids: moveItem(item.server_ids, from, to) }
      : item
  )
}

/** Troca o nome de uma pasta. */
export function renameFolder(
  items: readonly RailLayoutItem[],
  folderId: string,
  name: string
): RailLayoutItem[] {
  const clean = normalizeFolderName(name)
  return items.map((item) =>
    item.kind === 'folder' && item.id === folderId ? { ...item, name: clean } : item
  )
}

/** Desfaz a pasta, devolvendo os servidores dela para o mesmo ponto do topo. */
export function ungroupFolder(
  items: readonly RailLayoutItem[],
  folderId: string
): RailLayoutItem[] {
  const out: RailLayoutItem[] = []
  for (const item of items) {
    if (item.kind === 'folder' && item.id === folderId) {
      for (const sid of item.server_ids) out.push({ kind: 'server', server_id: sid })
    } else {
      out.push(item)
    }
  }
  return out
}

function resolveFolderVoice(views: readonly ServerRailView[]): 'mine' | 'active' | null {
  if (views.some((v) => v.voice === 'mine')) return 'mine'
  if (views.some((v) => v.voice === 'active')) return 'active'
  return null
}

/** Selos agregados de uma pasta recolhida a partir dos servidores dentro dela. */
export function folderRailView(
  views: readonly ServerRailView[],
  anyActive: boolean
): ServerRailView {
  const badge = views.reduce((sum, v) => sum + v.badge, 0)
  const allDimmed = views.length > 0 && views.every((v) => v.dimmed)
  return {
    dimmed: !anyActive && allDimmed,
    badge,
    voice: resolveFolderVoice(views)
  }
}
