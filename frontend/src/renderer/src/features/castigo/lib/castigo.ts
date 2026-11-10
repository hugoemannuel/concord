// Castigo nas calls do servidor (docs/adr/0061-castigo-na-call.md). Puro: as
// regras que o app usa para mostrar e travar botões. Quem decide é o servidor.

/** O que o castigo tira. */
export interface CastigoEffects {
  speak: boolean
  connect: boolean
  listen: boolean
}

/** Até quando cada efeito vale (null = não vale), como o servidor manda. */
export interface Castigo {
  server_id: string
  user_id: string
  speak_until: string | null
  connect_until: string | null
  listen_until: string | null
}

export type VoteStatus = 'open' | 'passed' | 'failed' | 'expired'

/** A votação de castigo de uma call (castigo:vote). */
export interface CastigoVote {
  id: string
  call_id: string
  server_id: string
  target_id: string
  initiator_id: string
  effects: CastigoEffects
  duration: number
  voters: string[]
  yes: string[]
  no: string[]
  needed: number
  expires_at: string
  status: VoteStatus
}

export type EffectKey = keyof CastigoEffects

export const EFFECT_KEYS: EffectKey[] = ['speak', 'connect', 'listen']

/** Prazos em segundos (os mesmos do servidor). */
export const DURATIONS = [60, 300, 600, 1800, 3600] as const

export type CastigoDuration = (typeof DURATIONS)[number]

const UNTIL: Record<EffectKey, keyof Castigo> = {
  speak: 'speak_until',
  connect: 'connect_until',
  listen: 'listen_until'
}

function untilOf(c: Castigo, key: EffectKey): number | null {
  const raw = c[UNTIL[key]]
  if (!raw) return null
  const t = Date.parse(raw)
  return Number.isNaN(t) ? null : t
}

/** O que vale agora. */
export function activeEffects(c: Castigo | null | undefined, now: number): CastigoEffects {
  const on = (key: EffectKey): boolean => {
    const t = c ? untilOf(c, key) : null
    return t !== null && t > now
  }
  return { speak: on('speak'), connect: on('connect'), listen: on('listen') }
}

export function hasAnyEffect(e: CastigoEffects): boolean {
  return e.speak || e.connect || e.listen
}

/** Quando o castigo inteiro acaba (o efeito que vai mais longe), ou null se já acabou. */
export function castigoEndsAt(c: Castigo | null | undefined, now: number): number | null {
  if (!c) return null
  const ends = EFFECT_KEYS.map((key) => untilOf(c, key)).filter(
    (t): t is number => t !== null && t > now
  )
  return ends.length ? Math.max(...ends) : null
}

/** A moderação de voz que a pessoa tem no servidor (aplicar direto pede a de cada efeito). */
export interface DirectPowers {
  canMute: boolean
  canDeafen: boolean
  canDisconnect: boolean
}

/** Dá para castigar (ou tirar o castigo) direto com estes efeitos. */
export function canApplyDirect(effects: CastigoEffects, powers: DirectPowers): boolean {
  if (!hasAnyEffect(effects)) return false
  return (
    (!effects.speak || powers.canMute) &&
    (!effects.listen || powers.canDeafen) &&
    (!effects.connect || powers.canDisconnect)
  )
}

/** Alguma moderação de voz (o modal mostra o botão de castigar direto). */
export function hasAnyPower(powers: DirectPowers): boolean {
  return powers.canMute || powers.canDeafen || powers.canDisconnect
}

export type BallotState = 'can_vote' | 'voted_yes' | 'voted_no' | 'not_voter'

/** Onde a pessoa está na votação. */
export function ballotState(vote: CastigoVote, meId: string | undefined): BallotState {
  if (!meId || !vote.voters.includes(meId)) return 'not_voter'
  if (vote.yes.includes(meId)) return 'voted_yes'
  if (vote.no.includes(meId)) return 'voted_no'
  return 'can_vote'
}

export interface VoteView {
  ballot: BallotState
  /** A votação é sobre mim. */
  isTarget: boolean
  /** Já tem resultado (passou, falhou ou venceu). */
  closed: boolean
}

/** O que a votação mostra para mim (sem votação: nada a fazer). */
export function voteView(vote: CastigoVote | null, meId: string | undefined): VoteView {
  if (!vote) return { ballot: 'not_voter', isTarget: false, closed: false }
  return {
    ballot: ballotState(vote, meId),
    isTarget: meId === vote.target_id,
    closed: vote.status !== 'open'
  }
}

/** Quem dá nome na votação: quem está na call ou no servidor. */
export interface NamedPerson {
  id?: string
  user_id?: string
  username?: string
  display_name?: string
  nickname?: string | null
}

/** Nome de userId: o da call primeiro, depois o do servidor (apelido antes). */
export function personName(
  userId: string,
  participants: NamedPerson[],
  members: NamedPerson[]
): string {
  const p = participants.find((x) => x.id === userId)
  if (p) return p.display_name || p.username || 'Alguém'
  const m = members.find((x) => x.user_id === userId)
  return m?.nickname || m?.display_name || m?.username || 'Alguém'
}
