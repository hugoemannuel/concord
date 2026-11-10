import { request } from '../../../shared/api/client'
import type { Castigo, CastigoEffects, CastigoVote } from '../lib/castigo'

export interface CastigoInput {
  user_id: string
  effects: CastigoEffects
  /** Segundos (um dos DURATIONS). */
  duration: number
}

/** Os castigos que valem agora no servidor. */
export function listCastigos(serverId: string): Promise<Castigo[]> {
  return request(`/servers/${serverId}/castigos`)
}

/** Castigo direto (pede a moderação de voz de cada efeito). */
export function applyCastigo(serverId: string, input: CastigoInput): Promise<Castigo> {
  return request(`/servers/${serverId}/castigos`, { method: 'POST', body: JSON.stringify(input) })
}

export function liftCastigo(serverId: string, userId: string): Promise<{ ok: boolean }> {
  return request(`/servers/${serverId}/castigos/${userId}`, { method: 'DELETE' })
}

/** Abre a votação na call (quem abre já vota sim). */
export function startCastigoVote(callId: string, input: CastigoInput): Promise<CastigoVote> {
  return request(`/calls/${callId}/castigo-votes`, { method: 'POST', body: JSON.stringify(input) })
}

export function castCastigoVote(
  callId: string,
  voteId: string,
  yes: boolean
): Promise<CastigoVote> {
  return request(`/calls/${callId}/castigo-votes/${voteId}/ballots`, {
    method: 'POST',
    body: JSON.stringify({ yes })
  })
}

/** A votação aberta na call (undefined se não há: 204). */
export function currentCastigoVote(callId: string): Promise<CastigoVote | undefined> {
  return request(`/calls/${callId}/castigo-votes/current`)
}
