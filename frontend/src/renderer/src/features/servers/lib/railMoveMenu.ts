import {
  addServerToFolder,
  findServerFolder,
  moveFolderServer,
  moveTopLevelItem,
  placeServerAtTopLevel,
  type RailFolderEntry,
  type RailLayoutItem
} from './serverRailLayout'

/** As escolhas do submenu "Mover para…" de um servidor do trilho (ADR 0049). */
export type RailMoveEntry =
  | { kind: 'new-folder' }
  | { kind: 'to-folder'; folderId: string; name: string }
  | { kind: 'out-of-folder' }
  | { kind: 'up' }
  | { kind: 'down' }

function otherFolders(items: readonly RailLayoutItem[], current: string | undefined): RailFolderEntry[] {
  return items.filter((i): i is RailFolderEntry => i.kind === 'folder' && i.id !== current)
}

/** Posição do servidor entre os irmãos (no trilho ou na pasta) e quantos irmãos há. */
function siblingSlot(
  items: readonly RailLayoutItem[],
  serverId: string,
  folder: RailFolderEntry | null
): { index: number; length: number } {
  if (folder) return { index: folder.server_ids.indexOf(serverId), length: folder.server_ids.length }
  return {
    index: items.findIndex((i) => i.kind === 'server' && i.server_id === serverId),
    length: items.length
  }
}

/** Escolhas disponíveis, na ordem do menu: criar pasta, pastas, tirar da pasta, subir, descer. */
export function railMoveEntries(items: readonly RailLayoutItem[], serverId: string): RailMoveEntry[] {
  const folder = findServerFolder(items, serverId)
  const { index, length } = siblingSlot(items, serverId, folder)
  const entries: RailMoveEntry[] = [{ kind: 'new-folder' }]
  for (const f of otherFolders(items, folder?.id)) {
    entries.push({ kind: 'to-folder', folderId: f.id, name: f.name })
  }
  if (folder) entries.push({ kind: 'out-of-folder' })
  if (index > 0) entries.push({ kind: 'up' })
  if (index >= 0 && index < length - 1) entries.push({ kind: 'down' })
  return entries
}

/**
 * O trilho depois de escolher `entry`; null quando a escolha não muda o
 * trilho (criar pasta abre o diálogo de nome).
 */
export function applyRailMove(
  items: RailLayoutItem[],
  serverId: string,
  entry: RailMoveEntry
): RailLayoutItem[] | null {
  const folder = findServerFolder(items, serverId)
  const { index } = siblingSlot(items, serverId, folder)
  switch (entry.kind) {
    case 'new-folder':
      return null
    case 'to-folder':
      return addServerToFolder(items, entry.folderId, serverId)
    case 'out-of-folder': {
      const at = items.findIndex((i) => i.kind === 'folder' && i.id === folder?.id)
      return placeServerAtTopLevel(items, serverId, at + 1)
    }
    case 'up':
    case 'down': {
      const to = index + (entry.kind === 'up' ? -1 : 1)
      return folder ? moveFolderServer(items, folder.id, index, to) : moveTopLevelItem(items, index, to)
    }
  }
}
