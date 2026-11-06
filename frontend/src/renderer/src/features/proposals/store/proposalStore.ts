import { create } from 'zustand'
import type {
  PendingProposalMention,
  Proposal,
  ProposalComment,
  ProposalStatus
} from '../api/proposals'
import {
  createProposal,
  createProposalComment,
  deleteProposal,
  deleteProposalComment,
  listProposalComments,
  listProposalMentions,
  listProposals,
  markProposalMentionsSeen,
  reactToProposalComment,
  removeProposalVote,
  setGithubUsername,
  setProposalStatus,
  unreactProposalComment,
  updateProposal,
  updateProposalComment,
  voteProposal
} from '../api/proposals'
import type { WsEvent } from '../../../shared/api/ws'
import { mergeProposal, moveProposal, restoreProposal } from '../lib/proposals'
import { useAuthStore } from '../../auth/store/authStore'
import { sessionGuard } from '../../auth/lib/sessionGuard'
import { showToast } from '../../../shared/store/toastStore'

interface ProposalState {
  proposals: Proposal[]
  isTech: boolean
  loading: boolean
  /** O quadro já respondeu uma vez: só a primeira carga mostra o skeleton. */
  loaded: boolean
  /** Última visita ao quadro (ms); nulo até carregar. Os cards criados depois contam no badge. */
  lastSeenAt: number | null
  pendingMentions: PendingProposalMention[]
  /** Comentários dos cards já abertos (o modal carrega ao abrir). */
  commentsByProposal: Record<string, ProposalComment[]>
  fetchProposals: () => Promise<void>
  create: (title: string, description: string, imageIds: string[]) => Promise<void>
  update: (id: string, title: string, description: string, imageIds: string[]) => Promise<void>
  vote: (id: string, approve: boolean) => Promise<void>
  removeVote: (id: string) => Promise<void>
  /** `takeOver`: confirmou tirar o card do dev que estava com ele. */
  setStatus: (id: string, status: ProposalStatus, takeOver?: boolean) => Promise<void>
  /** Usuário do GitHub de quem é do time tech (assignee das issues). */
  githubUsername: string | null
  saveGithubUsername: (username: string) => Promise<void>
  remove: (id: string) => Promise<void>
  markSeen: () => void
  fetchMentions: () => Promise<void>
  markMentionsSeen: (proposalId?: string) => Promise<void>
  loadComments: (id: string) => Promise<void>
  addComment: (
    id: string,
    body: string,
    mentions: string[],
    replyToId?: string | null,
    attachmentIds?: string[]
  ) => Promise<void>
  /** Põe (`add`) ou tira a reação da pessoa logada no comentário. */
  reactToComment: (id: string, commentId: string, emoji: string, add: boolean) => Promise<void>
  editComment: (id: string, commentId: string, body: string) => Promise<void>
  removeComment: (id: string, commentId: string) => Promise<void>
  handleWsEvent: (event: WsEvent) => void
  reset: () => void
}

const lastSeenKey = (userId: string): string => `concord.proposals.lastSeen.${userId}`

function readLastSeen(userId: string): number | null {
  try {
    const raw = localStorage.getItem(lastSeenKey(userId))
    const value = raw == null ? NaN : Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function writeLastSeen(userId: string, value: number): void {
  try {
    localStorage.setItem(lastSeenKey(userId), String(value))
  } catch {
    // sem armazenamento (janela privada, dados bloqueados): vale só nesta sessão
  }
}

/** Tira os comentários repetidos (o mesmo chega pela resposta da API e pelo tempo real). */
function upsertComment(list: ProposalComment[], comment: ProposalComment): ProposalComment[] {
  return list.some((c) => c.id === comment.id)
    ? list.map((c) => (c.id === comment.id ? comment : c))
    : [...list, comment]
}

export const useProposalStore = create<ProposalState>()((set, get) => {
  /** Troca o card pela resposta da API (traz o meu voto). */
  const apply = (p: Proposal): void => set({ proposals: mergeProposal(get().proposals, p) })

  const setComments = (
    id: string,
    update: (list: ProposalComment[]) => ProposalComment[]
  ): void => {
    const current = get().commentsByProposal[id]
    // Só mexe em quem já abriu os comentários; o resto carrega do servidor ao abrir.
    if (!current) return
    set({ commentsByProposal: { ...get().commentsByProposal, [id]: update(current) } })
  }

  /** Primeira visita (sem nada salvo) começa agora: não acusa propostas antigas. */
  const ensureLastSeen = (): void => {
    if (get().lastSeenAt != null) return
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    let seen = readLastSeen(userId)
    if (seen == null) {
      seen = Date.now()
      writeLastSeen(userId, seen)
    }
    set({ lastSeenAt: seen })
  }

  return {
    proposals: [],
    isTech: false,
    loading: false,
    loaded: false,
    lastSeenAt: null,
    pendingMentions: [],
    commentsByProposal: {},
    fetchProposals: async () => {
      const sameSession = sessionGuard()
      if (!get().loaded && get().proposals.length === 0) set({ loading: true })
      try {
        const board = await listProposals()
        if (!sameSession()) return
        set({
          proposals: Array.isArray(board.proposals) ? board.proposals : [],
          isTech: !!board.is_tech,
          githubUsername: board.github_username ?? null,
          loaded: true
        })
        ensureLastSeen()
      } catch (err) {
        console.error('[proposalStore] fetchProposals error:', err)
      } finally {
        if (get().loading) set({ loading: false })
      }
    },
    create: async (title, description, imageIds) =>
      apply(await createProposal(title, description, imageIds)),
    update: async (id, title, description, imageIds) =>
      apply(await updateProposal(id, title, description, imageIds)),
    vote: async (id, approve) => apply(await voteProposal(id, approve)),
    removeVote: async (id) => {
      const p = await removeProposalVote(id)
      // A resposta já vem sem o meu voto: força o nulo no merge.
      set({ proposals: get().proposals.map((x) => (x.id === id ? { ...p, my_vote: null } : x)) })
    },
    setStatus: async (id, status, takeOver = false) => {
      // O card muda de coluna antes da resposta (o arrasto não espera a rede);
      // se o servidor recusar, ele volta como estava.
      const previous = get().proposals.find((p) => p.id === id)
      if (previous) set({ proposals: moveProposal(get().proposals, id, status) })
      try {
        apply(await setProposalStatus(id, status, takeOver))
      } catch (err) {
        if (previous) set({ proposals: restoreProposal(get().proposals, previous) })
        throw err
      }
    },
    githubUsername: null,
    saveGithubUsername: async (username) => {
      set({ githubUsername: await setGithubUsername(username) })
    },
    remove: async (id) => {
      await deleteProposal(id)
      set({ proposals: get().proposals.filter((p) => p.id !== id) })
    },
    markSeen: () => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) return
      const now = Date.now()
      writeLastSeen(userId, now)
      set({ lastSeenAt: now })
    },
    fetchMentions: async () => {
      const sameSession = sessionGuard()
      try {
        const mentions = await listProposalMentions()
        if (!sameSession()) return
        const first = get().pendingMentions.length === 0 && mentions.length > 0
        set({ pendingMentions: mentions })
        // Ao abrir o app: um aviso só para tudo que ficou pendente.
        if (first) {
          const n = mentions.length
          showToast.info(
            n === 1
              ? `${mentions[0].author_name} te marcou na proposta "${mentions[0].proposal_title}"`
              : `Você foi marcado em ${n} comentários de propostas`
          )
        }
      } catch (err) {
        console.error('[proposalStore] fetchMentions error:', err)
      }
    },
    markMentionsSeen: async (proposalId) => {
      const before = get().pendingMentions
      const rest = proposalId ? before.filter((m) => m.proposal_id !== proposalId) : []
      if (rest.length === before.length) return
      set({ pendingMentions: rest })
      try {
        await markProposalMentionsSeen(proposalId)
      } catch (err) {
        console.error('[proposalStore] markMentionsSeen error:', err)
        void get().fetchMentions()
      }
    },
    loadComments: async (id) => {
      const sameSession = sessionGuard()
      const comments = await listProposalComments(id)
      if (!sameSession()) return
      set({ commentsByProposal: { ...get().commentsByProposal, [id]: comments } })
    },
    addComment: async (id, body, mentions, replyToId = null, attachmentIds = []) => {
      const comment = await createProposalComment(id, body, mentions, replyToId, attachmentIds)
      setComments(id, (list) => upsertComment(list, comment))
    },
    reactToComment: async (id, commentId, emoji, add) => {
      const comment = add
        ? await reactToProposalComment(id, commentId, emoji)
        : await unreactProposalComment(id, commentId, emoji)
      setComments(id, (list) => upsertComment(list, comment))
    },
    editComment: async (id, commentId, body) => {
      const comment = await updateProposalComment(id, commentId, body)
      setComments(id, (list) => upsertComment(list, comment))
    },
    removeComment: async (id, commentId) => {
      await deleteProposalComment(id, commentId)
      setComments(id, (list) => list.filter((c) => c.id !== commentId))
      set({ pendingMentions: get().pendingMentions.filter((m) => m.comment_id !== commentId) })
    },
    handleWsEvent: (event) => {
      const payload = event.payload as Record<string, unknown> | undefined
      switch (event.type) {
        case 'proposal:delete': {
          const id = payload?.id as string | undefined
          if (!id) return
          const comments = { ...get().commentsByProposal }
          delete comments[id]
          set({
            proposals: get().proposals.filter((p) => p.id !== id),
            commentsByProposal: comments,
            pendingMentions: get().pendingMentions.filter((m) => m.proposal_id !== id)
          })
          return
        }
        case 'proposal:create':
        case 'proposal:update': {
          const p = event.payload as unknown as Proposal
          if (p?.id) apply(p)
          return
        }
        case 'proposal:comment_create':
        case 'proposal:comment_update': {
          const c = event.payload as unknown as ProposalComment
          if (c?.id) setComments(c.proposal_id, (list) => upsertComment(list, c))
          return
        }
        case 'proposal:comment_delete': {
          const { id, proposal_id } = (payload ?? {}) as { id?: string; proposal_id?: string }
          if (!id || !proposal_id) return
          setComments(proposal_id, (list) => list.filter((c) => c.id !== id))
          set({ pendingMentions: get().pendingMentions.filter((m) => m.comment_id !== id) })
          return
        }
        case 'proposal:mention': {
          const m = event.payload as unknown as PendingProposalMention
          if (!m?.comment_id) return
          if (get().pendingMentions.some((x) => x.comment_id === m.comment_id)) return
          set({ pendingMentions: [m, ...get().pendingMentions] })
        }
      }
    },
    reset: () =>
      set({
        proposals: [],
        isTech: false,
        githubUsername: null,
        loading: false,
        loaded: false,
        lastSeenAt: null,
        pendingMentions: [],
        commentsByProposal: {}
      })
  }
})
