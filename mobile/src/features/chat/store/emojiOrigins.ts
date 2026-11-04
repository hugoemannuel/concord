import { create } from 'zustand'
import { useAuthStore } from '../../auth/store/authStore'
import { MAX_RESOLVE, resolveEmojis, type ResolvedExpression } from '../api/expressions'

// O que se sabe de cada emoji das mensagens: o servidor responde igual para
// quem é membro e para quem só recebeu, então vale para todos. Os pedidos do
// mesmo instante viram uma consulta só. undefined = ainda não sabe; null = não
// pode conhecer; senão, o emoji (e, apagado, sobrou o nome).

interface OriginsState {
  byId: Record<string, ResolvedExpression | null>
}

export const useEmojiOrigins = create<OriginsState>(() => ({ byId: {} }))

// Trocou de conta: o que cada um pode conhecer muda.
useAuthStore.subscribe((state, prev) => {
  if (state.user?.id !== prev.user?.id) resetEmojiOrigins()
})

const pending = new Set<string>()
const inFlight = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null

async function resolveBatch(ids: string[]): Promise<void> {
  try {
    const { emojis } = await resolveEmojis(ids)
    useEmojiOrigins.setState((s) => {
      const byId = { ...s.byId }
      for (const id of ids) byId[id] = null
      for (const item of emojis) byId[item.id] = item
      return { byId }
    })
  } catch {
    // Sem rede: fica sem resposta, e a próxima vez que aparecer pergunta de novo.
  } finally {
    for (const id of ids) inFlight.delete(id)
  }
}

function flush(): void {
  timer = null
  const ids = [...pending]
  pending.clear()
  for (let i = 0; i < ids.length; i += MAX_RESOLVE) void resolveBatch(ids.slice(i, i + MAX_RESOLVE))
}

export function requestEmojiOrigin(id: string): void {
  if (useEmojiOrigins.getState().byId[id] !== undefined || inFlight.has(id)) return
  inFlight.add(id)
  pending.add(id)
  timer ??= setTimeout(flush, 0)
}

/** Volta ao estado inicial (troca de conta e testes). */
export function resetEmojiOrigins(): void {
  if (timer) clearTimeout(timer)
  timer = null
  pending.clear()
  inFlight.clear()
  useEmojiOrigins.setState({ byId: {} })
}
