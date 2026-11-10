// Quando o menu de um usuário mostra o castigo. Puro.
import {
  activeEffects,
  canApplyDirect,
  hasAnyPower,
  type Castigo,
  type DirectPowers
} from './castigo'

export interface CastigoMenuInput {
  /** O alvo é membro do servidor aberto, não sou eu e não é o dono. */
  eligible: boolean
  /** A call de canal em que os dois estamos (votação), se houver. */
  sharedCallId?: string
  powers: DirectPowers
  castigo?: Castigo
  now: number
}

export interface CastigoMenu {
  /** "Castigo…": abrir votação (na mesma call) ou castigar direto. */
  canOpen: boolean
  /** "Tirar castigo": tem castigo e a moderação de todos os efeitos dele. */
  canLift: boolean
}

export function castigoMenu(input: CastigoMenuInput): CastigoMenu {
  if (!input.eligible) return { canOpen: false, canLift: false }
  return {
    canOpen: Boolean(input.sharedCallId) || hasAnyPower(input.powers),
    canLift: canApplyDirect(activeEffects(input.castigo, input.now), input.powers)
  }
}
