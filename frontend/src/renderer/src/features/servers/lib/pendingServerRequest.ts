/** Quanto tempo um pedido espera o servidor abrir antes de ser esquecido. */
export const PENDING_TTL_MS = 15_000

export interface PendingRequest {
  serverId: string
  at: number
}

export type PendingVerdict = 'run' | 'wait' | 'drop'

/**
 * O pedido pode rodar? Só com o servidor pedido aberto e carregado. Passou
 * do prazo (a pessoa foi para outro lugar), descarta: não pode disparar
 * um diálogo surpresa minutos depois.
 */
export function pendingVerdict(
  pending: PendingRequest,
  open: { serverId: string | undefined; loading: boolean },
  now: number
): PendingVerdict {
  if (now - pending.at > PENDING_TTL_MS) return 'drop'
  return open.serverId === pending.serverId && !open.loading ? 'run' : 'wait'
}

/**
 * Decide o destino do pedido e limpa o que deve sair da fila. Devolve a ação
 * a rodar agora (ou null: nada, ou ainda esperando).
 */
export function settlePending(
  pending: (PendingRequest & { run: () => void }) | null,
  open: { serverId: string | undefined; loading: boolean },
  now: number,
  clear: () => void
): (() => void) | null {
  if (!pending) return null
  const verdict = pendingVerdict(pending, open, now)
  if (verdict === 'wait') return null
  clear()
  return verdict === 'run' ? pending.run : null
}
