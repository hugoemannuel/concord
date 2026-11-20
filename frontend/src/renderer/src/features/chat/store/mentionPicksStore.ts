import { create } from 'zustand'
import { roomUpdate, roomValue, type RoomMap } from '../lib/roomState'
import type { RolePicks } from '../lib/roleMentions'

// Cargos escolhidos na lista do "@" de cada sala (handle -> id do cargo).
// Ficam aqui, ao lado do rascunho (draftStore), e não no componente: a escolha
// tem que valer enquanto o "@handle" estiver no texto, mesmo se o envio falhar
// e o texto voltar, ou se a pessoa sair da sala e voltar (ADR 0065: com cargo
// e pessoa de mesmo nome, vale o que foi escolhido). Só em memória.

interface MentionPicksState {
  byRoom: RoomMap<RolePicks>
  update: (room: string, next: (prev: RolePicks) => RolePicks) => void
}

/** Nenhum cargo escolhido (o mesmo objeto, para o estado não mudar à toa). */
const NO_PICKS: RolePicks = {}

export const useMentionPicksStore = create<MentionPicksState>()((set) => ({
  byRoom: {},
  update: (room, next) =>
    set((s) => {
      const byRoom = roomUpdate(s.byRoom, room, NO_PICKS, withoutEmpty(next))
      return byRoom === s.byRoom ? s : { byRoom }
    })
}))

/** Escolhas vazias viram o NO_PICKS: a sala sai do mapa. */
const withoutEmpty =
  (next: (prev: RolePicks) => RolePicks) =>
  (prev: RolePicks): RolePicks => {
    const value = next(prev)
    return Object.keys(value).length === 0 ? NO_PICKS : value
  }

/** Os cargos escolhidos na sala. */
export function picksOf(state: Pick<MentionPicksState, 'byRoom'>, room: string): RolePicks {
  return roomValue(state.byRoom, room, NO_PICKS)
}
