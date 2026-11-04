import { create } from 'zustand'
import { lookupServerTags, type ServerTag } from '../api/serverProfile'

// A tag de cada pessoa na tela (mensagens, membros, cartão de perfil). As linhas
// pedem por id; os pedidos de um instante viram uma consulta só, e o resultado
// fica guardado até um evento mudar ou o prazo passar. Fica fora das respostas de
// mensagens e membros de propósito: nenhuma rota antiga muda (ADR 0050).

/** Prazo da cópia local (cobre o que não vem por evento, como servidor apagado). */
export const TAG_CACHE_MS = 10 * 60 * 1000
const BATCH_MS = 30
const REFRESH_SPREAD_MS = 1500
const MAX_PER_LOOKUP = 200

interface CachedTag {
  tag: ServerTag | null
  at: number
}

interface ServerTagState {
  byUser: Record<string, CachedTag>
  /** Garante que a tag desse id vai chegar (nada a fazer se já está guardada). */
  request: (userId: string) => void
  setUserTag: (userId: string, tag: ServerTag | null, leftServerId?: string) => void
  /** A tag do servidor mudou: pergunta de novo por quem a usa. */
  refreshServer: (serverId: string) => void
}

const pending = new Set<string>()
/** Já perguntados, ainda sem resposta (a mensagem e a lista de membros pedem o mesmo id). */
const inFlight = new Set<string>()
let timer: ReturnType<typeof setTimeout> | undefined

function chunks(ids: string[]): string[][] {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += MAX_PER_LOOKUP) out.push(ids.slice(i, i + MAX_PER_LOOKUP))
  return out
}

async function lookup(ids: string[]): Promise<void> {
  try {
    const tags = await lookupServerTags(ids)
    const at = Date.now()
    useServerTagStore.setState((s) => {
      const byUser = { ...s.byUser }
      for (const id of ids) byUser[id] = { tag: tags[id] ?? null, at }
      return { byUser }
    })
  } catch {
    // A tag é enfeite: sem rede, a linha fica sem ela e o próximo pedido tenta de novo.
  } finally {
    for (const id of ids) inFlight.delete(id)
  }
}

function flush(): void {
  timer = undefined
  const ids = [...pending]
  pending.clear()
  for (const id of ids) inFlight.add(id)
  for (const batch of chunks(ids)) void lookup(batch)
}

function schedule(delay: number): void {
  timer ??= setTimeout(flush, delay)
}

export const useServerTagStore = create<ServerTagState>()((set, get) => ({
  byUser: {},
  request: (userId) => {
    const cached = get().byUser[userId]
    if (inFlight.has(userId) || (cached && Date.now() - cached.at < TAG_CACHE_MS)) return
    pending.add(userId)
    schedule(BATCH_MS)
  },
  setUserTag: (userId, tag, leftServerId) => {
    set((s) => {
      const current = s.byUser[userId]?.tag
      if (leftServerId && current?.server_id !== leftServerId) return s
      return { byUser: { ...s.byUser, [userId]: { tag, at: Date.now() } } }
    })
  },
  refreshServer: (serverId) => {
    const ids = Object.entries(get().byUser)
      .filter(([, cached]) => cached.tag?.server_id === serverId)
      .map(([userId]) => userId)
    if (ids.length === 0) return
    for (const id of ids) pending.add(id)
    // Todo mundo ouve o aviso: espalha as perguntas por um instante.
    schedule(BATCH_MS + Math.random() * REFRESH_SPREAD_MS)
  }
}))
