import type { CallStatus } from '../../../call/lib/callTypes'
import type { DeviceLabel, DeviceState } from './deviceTypes'

// O que a pessoa fazia (só leitura dos stores de call e atividade) e a
// cadência das linhas: 1 por minuto em call ou live, 1 a cada 5 min parado.

export interface LabelInput {
  status: CallStatus
  isScreenSharing: boolean
  watchedScreenIds: readonly string[]
  activityEnabled: boolean
  detectedGame: unknown
}

function stateOf(input: LabelInput): DeviceState {
  if (input.isScreenSharing) return 'transmitindo'
  return input.status === 'active' ? 'call' : 'parado'
}

export function deviceLabelOf(input: LabelInput): DeviceLabel {
  return {
    state: stateOf(input),
    watching: input.watchedScreenIds.length > 0,
    game: input.activityEnabled ? input.detectedGame !== null : null
  }
}

export function sameLabel(a: DeviceLabel, b: DeviceLabel): boolean {
  return a.state === b.state && a.watching === b.watching && a.game === b.game
}

const RANK: Record<DeviceState, number> = { parado: 0, call: 1, transmitindo: 2 }

/** Saiu da live (para call ou parado) ou da call: o lote vai logo. */
export function leftCallOrLive(before: DeviceState, after: DeviceState): boolean {
  return RANK[after] < RANK[before]
}

export function rowSecondsFor(state: DeviceState): number {
  return state === 'parado' ? 300 : 60
}

/**
 * Só com login de conta. Visitante sem conta (`anonymousGuestLink` do
 * guestSessionStore não nulo) não manda nada: o servidor recusaria o token.
 */
export function shouldCollect(accessToken: string | null, guestLink: string | null): boolean {
  return accessToken !== null && guestLink === null
}
