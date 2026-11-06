import { create } from 'zustand'
import type { WsEvent } from '../../../shared/api/ws'
import { sessionGuard } from '../../auth/lib/sessionGuard'
import { getServerLayout, saveServerLayout } from '../api/serverLayout'
import type { RailLayoutItem } from '../lib/serverRailLayout'

const COLLAPSED_STORAGE_KEY = 'concord-rail-collapsed-folders'

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  return window.localStorage ?? null
}

function loadCollapsedFolders(): Record<string, boolean> {
  try {
    const raw = getStorage()?.getItem(COLLAPSED_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function persistCollapsedFolders(map: Record<string, boolean>): void {
  try {
    getStorage()?.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ambiente sem localStorage (ex.: testes)
  }
}

export interface FolderModalState {
  mode: 'create' | 'rename'
  folderId?: string
  initialName?: string
  initialServerIds?: string[]
}

export interface ServerLayoutState {
  items: RailLayoutItem[]
  loaded: boolean
  collapsedFolders: Record<string, boolean>
  folderModal: FolderModalState | null
  fetchLayout: () => Promise<void>
  saveLayout: (items: RailLayoutItem[]) => Promise<void>
  toggleFolder: (folderId: string) => void
  setFolderCollapsed: (folderId: string, collapsed: boolean) => void
  openFolderModal: (modal: FolderModalState) => void
  closeFolderModal: () => void
  handleWsEvent: (event: WsEvent) => void
  reset: () => void
}

let saveGeneration = 0

export const useServerLayoutStore = create<ServerLayoutState>()((set, get) => ({
  items: [],
  loaded: false,
  collapsedFolders: loadCollapsedFolders(),
  folderModal: null,

  fetchLayout: async () => {
    const sameSession = sessionGuard()
    try {
      const items = await getServerLayout()
      if (!sameSession()) return
      set({ items, loaded: true })
    } catch {
      if (sameSession()) set({ loaded: true })
    }
  },

  saveLayout: async (nextItems) => {
    const previous = get().items
    const gen = ++saveGeneration
    set({ items: nextItems })
    try {
      const saved = await saveServerLayout(nextItems)
      if (gen === saveGeneration) set({ items: saved })
    } catch (err) {
      if (gen === saveGeneration) set({ items: previous })
      throw err
    }
  },

  toggleFolder: (folderId) => {
    const next = { ...get().collapsedFolders, [folderId]: !get().collapsedFolders[folderId] }
    persistCollapsedFolders(next)
    set({ collapsedFolders: next })
  },

  setFolderCollapsed: (folderId, collapsed) => {
    const next = { ...get().collapsedFolders, [folderId]: collapsed }
    persistCollapsedFolders(next)
    set({ collapsedFolders: next })
  },

  openFolderModal: (folderModal) => set({ folderModal }),
  closeFolderModal: () => set({ folderModal: null }),

  handleWsEvent: (event) => {
    if (event.type !== 'server:layout') return
    const payload = (event.payload ?? {}) as { items?: RailLayoutItem[] }
    if (Array.isArray(payload.items)) {
      set({ items: payload.items, loaded: true })
    }
  },

  reset: () => {
    saveGeneration++
    set({ items: [], loaded: false, collapsedFolders: {}, folderModal: null })
  }
}))
