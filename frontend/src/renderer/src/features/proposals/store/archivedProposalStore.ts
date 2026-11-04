import { create } from 'zustand'
import type { WsEvent } from '../../../shared/api/ws'
import type { ArchivableStatus } from '../api/archive'
import {
  archiveAllProposals,
  archiveProposal,
  listArchivedProposals,
  unarchiveProposal
} from '../api/archive'
import type { Proposal } from '../api/proposals'
import { dropArchived, mergePage } from '../lib/archive'
import { mergeProposal } from '../lib/proposals'
import { useProposalStore } from './proposalStore'

interface ArchivedState {
  items: Proposal[]
  hasMore: boolean
  /** Próxima página a pedir (a 0 já veio quando `loaded`). */
  page: number
  /** Busca já aplicada na lista. */
  query: string
  /** O que a pessoa digitou (a busca sai depois de uma pausa na digitação). */
  text: string
  loading: boolean
  loadingMore: boolean
  loaded: boolean
  error: boolean
  /** Alguém arquivou/desarquivou: a lista aberta precisa ser relida. */
  stale: boolean
  /** (Re)carrega da primeira página, com a busca `query`. */
  fetch: (query?: string) => Promise<void>
  /** Relê só se a lista nunca carregou ou ficou velha (alguém arquivou/desarquivou). */
  ensureFresh: () => Promise<void>
  /** Guarda o texto digitado e busca depois de uma pausa. */
  setText: (text: string) => void
  loadMore: () => Promise<void>
  archive: (id: string) => Promise<void>
  /** Devolve quantas foram arquivadas. */
  archiveAll: (status: ArchivableStatus) => Promise<number>
  unarchive: (id: string) => Promise<void>
  handleWsEvent: (event: WsEvent) => void
  reset: () => void
}

const initial = {
  items: [],
  hasMore: false,
  page: 0,
  query: '',
  text: '',
  loading: false,
  loadingMore: false,
  loaded: false,
  error: false,
  stale: false
}

/** Tira do quadro os cards arquivados (aqui ou por outro cliente). */
function removeFromBoard(ids: string[]): void {
  const { proposals } = useProposalStore.getState()
  useProposalStore.setState({ proposals: dropArchived(proposals, ids) })
}

// Espera a pessoa parar de digitar antes de buscar.
export const SEARCH_DELAY_MS = 300
let searchTimer: ReturnType<typeof setTimeout> | undefined

// Só a última busca vale: digitar rápido deixa respostas velhas para trás.
let latestFetch = 0

export const useArchivedProposalStore = create<ArchivedState>()((set, get) => ({
  ...initial,
  fetch: async (query = get().query) => {
    const mine = ++latestFetch
    set({ query, loading: !get().loaded, error: false, stale: false })
    try {
      const res = await listArchivedProposals(0, query)
      if (mine !== latestFetch) return
      set({ items: res.proposals, hasMore: res.has_more, page: 1, loaded: true })
    } catch (err) {
      console.error('[archivedProposalStore] fetch error:', err)
      if (mine === latestFetch) set({ error: true })
    } finally {
      if (mine === latestFetch) set({ loading: false })
    }
  },
  ensureFresh: async () => {
    if (!get().loaded || get().stale) await get().fetch(get().text)
  },
  setText: (text) => {
    set({ text })
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => void get().fetch(text), SEARCH_DELAY_MS)
  },
  loadMore: async () => {
    const { hasMore, loadingMore, page, query } = get()
    if (!hasMore || loadingMore) return
    const mine = latestFetch
    set({ loadingMore: true })
    try {
      const res = await listArchivedProposals(page, query)
      if (mine !== latestFetch) return
      set({ items: mergePage(get().items, res.proposals), hasMore: res.has_more, page: page + 1 })
    } finally {
      set({ loadingMore: false })
    }
  },
  archive: async (id) => {
    await archiveProposal(id)
    removeFromBoard([id])
    set({ stale: true })
  },
  archiveAll: async (status) => {
    const ids = await archiveAllProposals(status)
    removeFromBoard(ids)
    set({ stale: true })
    return ids.length
  },
  unarchive: async (id) => {
    const card = await unarchiveProposal(id)
    set({ items: get().items.filter((p) => p.id !== id) })
    useProposalStore.setState({ proposals: mergeProposal(useProposalStore.getState().proposals, card) })
  },
  handleWsEvent: (event) => {
    const payload = event.payload as Record<string, unknown> | undefined
    if (event.type === 'proposal:archive') {
      const ids = payload?.ids
      if (!Array.isArray(ids)) return
      removeFromBoard(ids as string[])
    } else {
      const card = event.payload as unknown as Proposal | undefined
      if (!card?.id) return
      useProposalStore.setState({
        proposals: mergeProposal(useProposalStore.getState().proposals, card)
      })
    }
    set({ stale: true })
  },
  reset: () => {
    latestFetch++
    clearTimeout(searchTimer)
    set(initial)
  }
}))

// Sair da conta zera o quadro (proposalStore.reset): a lista de arquivadas vai junto.
useProposalStore.subscribe((state, prev) => {
  if (prev.loaded && !state.loaded) useArchivedProposalStore.getState().reset()
})
