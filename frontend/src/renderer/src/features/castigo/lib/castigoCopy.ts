import { ApiError } from '../../../shared/api/client'
import type { CastigoEffects, CastigoVote, EffectKey } from './castigo'

/**
 * Todos os textos do castigo num lugar só (para aprovar ou trocar sem caçar
 * pelos componentes).
 */
export const CASTIGO_COPY = {
  menuItem: 'Castigo…',
  liftItem: 'Tirar castigo',
  modalTitle: (name: string): string => `Castigo para ${name}`,
  modalIntro: 'Por um tempo, em todas as calls do servidor.',
  effectsLabel: 'O que tirar',
  effect: { speak: 'Falar', connect: 'Entrar na call', listen: 'Escutar' } as Record<
    EffectKey,
    string
  >,
  durationLabel: 'Por quanto tempo',
  applyNow: 'Castigar agora',
  startVote: 'Abrir votação',
  voteHint:
    'A call vota por 1 minuto. Vale com mais da metade de quem está nela (sem contar a pessoa).',
  noPowerHint:
    'Para castigar sem votação, é preciso um cargo que silencia, ensurdece ou desconecta.',
  missingPowerHint: 'Seu cargo não deixa castigar direto com essa escolha.',
  pickEffect: 'Escolha pelo menos uma opção.',
  applied: (name: string): string => `${name} está de castigo.`,
  voteStarted: 'Votação aberta.',
  lifted: (name: string): string => `O castigo de ${name} acabou.`,
  // Votação na call
  voteTitle: (target: string): string => `Castigo para ${target}?`,
  voteBy: (initiator: string): string => `Votação aberta por ${initiator}`,
  voteCount: (yes: number, needed: number): string => `${yes} de ${needed} votos`,
  voteYes: 'Sim',
  voteNo: 'Não',
  voted: 'Você votou',
  notVoter: 'Você entrou depois: não vota',
  isTarget: 'A votação é sobre você',
  votePassed: (target: string): string => `${target} ficou de castigo.`,
  voteFailed: 'A votação não passou.',
  // A própria pessoa
  selfTitle: 'Você está de castigo',
  endsAt: (time: string): string => `Termina às ${time}`,
  failed: 'Não foi possível aplicar o castigo.',
  voteFailedToStart: 'Não foi possível abrir a votação.',
  ballotFailed: 'Não foi possível votar.',
  liftFailed: 'Não foi possível tirar o castigo.'
}

const DURATION_LABELS: Record<number, string> = {
  60: '1 min',
  300: '5 min',
  600: '10 min',
  1800: '30 min',
  3600: '1 hora'
}

export function durationLabel(seconds: number): string {
  return DURATION_LABELS[seconds] ?? `${Math.round(seconds / 60)} min`
}

const WITHOUT: Record<EffectKey, string> = {
  speak: 'sem falar',
  connect: 'sem entrar na call',
  listen: 'sem escutar'
}

/** "sem falar e sem escutar". */
export function effectsSummary(e: CastigoEffects): string {
  const parts = (Object.keys(WITHOUT) as EffectKey[]).filter((k) => e[k]).map((k) => WITHOUT[k])
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`
}

/** "sem falar · 5 min": o que a votação pede. */
export function voteSummary(vote: Pick<CastigoVote, 'effects' | 'duration'>): string {
  return `${effectsSummary(vote.effects)} · ${durationLabel(vote.duration)}`
}

const BY_CODE: Record<string, string> = {
  invalid: 'Escolha o que tirar e por quanto tempo.',
  self: 'Você não pode castigar a si mesmo.',
  not_in_call: 'Vocês dois precisam estar nesta call.',
  few_voters: 'A votação precisa de pelo menos 3 pessoas na call.',
  not_member: 'Só membros do servidor.',
  missing_permission: 'Seu cargo não deixa castigar direto com essa escolha.',
  role_hierarchy: 'Você não pode castigar alguém de cargo igual ou acima do seu.',
  owner: 'O dono do servidor não fica de castigo.',
  not_voter: 'Só quem estava na call quando a votação abriu vota.',
  not_found: 'Essa pessoa não está mais de castigo.',
  vote_not_found: 'Essa votação já acabou.',
  vote_open: 'Já tem uma votação de castigo nesta call.',
  already_voted: 'Você já votou.',
  cooldown: 'Espere um pouco para abrir outra votação.'
}

export function castigoErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.code && BY_CODE[err.code]) return BY_CODE[err.code]
  return fallback
}

/** "14:32" no fuso de quem vê. */
export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** "speak,listen" (como o registro de auditoria guarda) em "Falar, Escutar". */
export function castigoEffectsLabel(names: string): string {
  return names
    .split(',')
    .filter((n): n is EffectKey => n in CASTIGO_COPY.effect)
    .map((n) => CASTIGO_COPY.effect[n])
    .join(', ')
}
