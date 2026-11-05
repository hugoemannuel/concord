import { useFriendStore } from '../store/friendStore'
import type { TabCounts } from '../lib/friendsTabs'

/** Números dos selos das abas: pedidos de amizade recebidos. */
export function useTabCounts(): TabCounts {
  const pending = useFriendStore((s) => s.pending.filter((p) => p.direction === 'incoming').length)
  return { pending }
}
