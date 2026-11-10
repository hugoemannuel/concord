// Eventos de castigo que chegam pelo WebSocket. Puro: quem aplica é o
// castigoStart (no store).
import type { WsEvent } from '../../../shared/api/ws'
import type { Castigo, CastigoVote } from './castigo'

export interface CastigoEventDeps {
  upsert: (c: Castigo) => void
  setVote: (vote: CastigoVote) => void
}

type Payload = Record<string, unknown> | null | undefined

export function handleCastigoEvent(event: WsEvent, deps: CastigoEventDeps): void {
  const p = event.payload as Payload
  if (event.type === 'castigo:update' && p?.server_id && p.user_id) {
    deps.upsert(p as unknown as Castigo)
  } else if (event.type === 'castigo:vote' && p?.id && p.call_id) {
    deps.setVote(p as unknown as CastigoVote)
  }
}
