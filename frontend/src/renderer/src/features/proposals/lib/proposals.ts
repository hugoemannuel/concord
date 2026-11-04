import type {
  PendingProposalMention,
  Proposal,
  ProposalComment,
  ProposalStatus
} from '../api/proposals'
import { attachmentPreview } from '../../chat/lib/attachments'
import { textPreview, type Preview } from '../../chat/lib/preview'
import { API_BASE_URL } from '../../../shared/lib/config'
import { mentionsUser } from '../../chat/lib/mentions'
import { profileMediaSrc } from '../../profile/lib/profileMedia'

// Limites do backend (internal/proposal/model.go).
export const MAX_OPEN_PER_USER = 3
export const MAX_TITLE = 120
export const MAX_DESCRIPTION = 2000
export const MAX_COMMENT = 1000
export const MAX_IMAGES = 4
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_MENTIONS = 10

/** `accept` do seletor de imagens: os tipos que o backend aceita. */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif'

/** Colunas do quadro, na ordem; "Recusada" fica atrás de um filtro. */
export const BOARD_COLUMNS: { status: ProposalStatus; title: string; hint: string }[] = [
  { status: 'voting', title: 'Em votação', hint: 'A comunidade decide em 7 dias' },
  { status: 'proposed', title: 'Proposto pro time tech', hint: 'Aprovado pela votação' },
  { status: 'in_progress', title: 'Em desenvolvimento', hint: 'O time está trabalhando' },
  { status: 'done', title: 'Concluído', hint: 'Já está no app' }
]

export const REJECTED_COLUMN = {
  status: 'rejected' as ProposalStatus,
  title: 'Recusada',
  hint: 'Não teve mais sim que não'
}

/** Rótulo de cada coluna no menu "Mover para". */
export const STATUS_ACTION_LABEL: Record<ProposalStatus, string> = {
  voting: 'Em votação',
  proposed: 'Proposto pro time tech',
  in_progress: 'Em desenvolvimento',
  done: 'Concluído',
  rejected: 'Recusada'
}

/** Para onde o time tech pode mover um card: qualquer coluna, menos votação e a atual. */
export function moveTargets(status: ProposalStatus): ProposalStatus[] {
  return (Object.keys(STATUS_ACTION_LABEL) as ProposalStatus[]).filter(
    (s) => s !== 'voting' && s !== status
  )
}

/** Arrastar um card: qualquer coluna diferente da atual, menos "Em votação" (não reabre). */
export function canDropOn(from: ProposalStatus, to: ProposalStatus): boolean {
  return from !== to && to !== 'voting'
}

/** Tirar um card de "Em votação" encerra a votação na hora e não tem volta: pede confirmação. */
export function needsCloseConfirm(p: Pick<Proposal, 'status'>): boolean {
  return p.status === 'voting'
}

/**
 * Mover um card que está com outro dev tira a tarefa dele: pede confirmação.
 * Arrastar para Concluída não (mantém quem estava: pode ser só o deploy).
 */
export function needsTakeover(
  p: Pick<Proposal, 'assignee'>,
  meId: string | null,
  target: ProposalStatus
): boolean {
  return !!p.assignee && !!meId && p.assignee.id !== meId && target !== 'done'
}

/** Usuário do GitHub (1–39, letras, números e hífen no meio), o "@" opcional. */
export function githubUsernameError(raw: string): string | null {
  const login = raw.trim().replace(/^@/, '')
  if (!login) return null
  return /^[A-Za-z0-9](?:[A-Za-z0-9]|-[A-Za-z0-9]){0,38}$/.test(login)
    ? null
    : 'Use o usuário do GitHub (letras, números e hífen).'
}

const timeOf = (iso: string | null | undefined): number => {
  const ms = iso ? new Date(iso).getTime() : NaN
  return Number.isFinite(ms) ? ms : 0
}

/**
 * Cards de uma coluna na ordem de exibição: em votação, o prazo que acaba
 * primeiro; nas demais, o que entrou na coluna por último (moved_at) no topo.
 */
export function sortColumn(cards: Proposal[], status: ProposalStatus): Proposal[] {
  const entered = (p: Proposal): number => timeOf(p.moved_at ?? p.closed_at ?? p.created_at)
  return [...cards].sort((a, b) =>
    status === 'voting'
      ? timeOf(a.voting_ends_at) - timeOf(b.voting_ends_at)
      : entered(b) - entered(a)
  )
}

/**
 * Move o card na hora, antes da resposta do servidor (o arrasto não pode
 * esperar a rede). Reproduz o que o backend grava; a resposta real o substitui.
 */
export function moveProposal(
  list: Proposal[],
  id: string,
  status: ProposalStatus,
  now = Date.now()
): Proposal[] {
  const stamp = new Date(now).toISOString()
  return list.map((p) =>
    p.id !== id
      ? p
      : {
          ...p,
          status,
          moved_at: stamp,
          closed_at: p.closed_at ?? stamp,
          close_reason: p.status === 'voting' ? 'manual' : p.close_reason
        }
  )
}

/** Desfaz moveProposal quando o servidor recusa: devolve o card como estava. */
export function restoreProposal(list: Proposal[], previous: Proposal): Proposal[] {
  return list.map((p) => (p.id === previous.id ? previous : p))
}

/** "Votação encerrada por Ana (time tech) em 25/10/2026"; nulo se ainda está em votação. */
export function closeLabel(
  p: Pick<Proposal, 'status' | 'close_reason' | 'closed_by_name' | 'closed_at'>
): string | null {
  if (p.status === 'voting' || !p.closed_at) return null
  const day = new Date(p.closed_at).toLocaleDateString('pt-BR')
  if (p.close_reason === 'manual') {
    return p.closed_by_name
      ? `Votação encerrada por ${p.closed_by_name} (time tech) em ${day}`
      : `Votação encerrada pelo time tech em ${day}`
  }
  return `Votação encerrada pelo prazo em ${day}`
}

/** Endereço para o <img> de uma imagem da proposta. */
export function proposalImageSrc(url: string): string {
  return profileMediaSrc(url, API_BASE_URL) ?? url
}

/** "3d 4h", "5h 20min", "12min" ou "encerrando" quando o prazo acabou. */
export function timeLeftLabel(endsAt: string, now: number = Date.now()): string {
  const ms = new Date(endsAt).getTime() - now
  if (!Number.isFinite(ms) || ms <= 0) return 'encerrando'
  const minutes = Math.floor(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes % 60}min`
  return `${Math.max(minutes, 1)}min`
}

/** Porcentagem de "sim" (0 quando ninguém votou). */
export function yesPercent(p: Pick<Proposal, 'yes_votes' | 'no_votes'>): number {
  const total = p.yes_votes + p.no_votes
  return total === 0 ? 0 : Math.round((p.yes_votes / total) * 100)
}

/** Ainda dá para votar: em votação e dentro do prazo. */
export function canVote(p: Pick<Proposal, 'status' | 'voting_ends_at'>, now = Date.now()): boolean {
  return p.status === 'voting' && new Date(p.voting_ends_at).getTime() > now
}

/**
 * Propostas novas em votação desde a última visita ao quadro (badge da barra).
 * Sem `lastSeenAt` (ainda não carregado) não conta nada; as suas não contam.
 */
export function unseenCount(
  proposals: Proposal[],
  lastSeenAt: number | null,
  meId: string | null,
  now = Date.now()
): number {
  if (lastSeenAt == null) return 0
  return proposals.filter(
    (p) => canVote(p, now) && p.author_id !== meId && new Date(p.created_at).getTime() > lastSeenAt
  ).length
}

/** Número do badge: propostas novas mais menções ainda não vistas. */
export function badgeCount(
  proposals: Proposal[],
  mentions: PendingProposalMention[],
  lastSeenAt: number | null,
  meId: string | null,
  now = Date.now()
): number {
  return unseenCount(proposals, lastSeenAt, meId, now) + mentions.length
}

/** O autor edita enquanto a votação está aberta; o time tech, a qualquer hora. */
export function canEditProposal(
  p: Pick<Proposal, 'author_id' | 'status' | 'voting_ends_at'>,
  meId: string | null,
  isTech: boolean,
  now = Date.now()
): boolean {
  return isTech || (meId != null && meId === p.author_id && canVote(p, now))
}

/** O autor apaga enquanto está em votação; o time tech, a qualquer hora. */
export function canDeleteProposal(
  p: Pick<Proposal, 'author_id' | 'status'>,
  meId: string | null,
  isTech: boolean
): boolean {
  return isTech || (meId != null && meId === p.author_id && p.status === 'voting')
}

/** A pessoa já reagiu a este comentário com este emoji? */
export function hasReacted(
  comment: Pick<ProposalComment, 'reactions'>,
  meId: string | null,
  emoji: string
): boolean {
  if (!meId) return false
  return (comment.reactions ?? []).some((r) => r.emoji === emoji && r.user_ids.includes(meId))
}

/**
 * Texto curto do comentário (prévia de resposta, aviso): o corpo, ou o rótulo do
 * anexo quando o comentário só tem arquivo.
 */
export function commentPreview(
  comment: Pick<ProposalComment, 'body'> & Partial<Pick<ProposalComment, 'attachments'>>,
  max = 100
): Preview {
  const text = comment.body.replace(/\s+/g, ' ').trim()
  if (!text) return attachmentPreview(comment.attachments) ?? textPreview('')
  return textPreview(text.length > max ? `${text.slice(0, max)}…` : text)
}

/** O autor do comentário edita; ele ou o time tech apagam. */
export function canEditComment(
  c: Pick<ProposalComment, 'author_id'>,
  meId: string | null
): boolean {
  return meId != null && c.author_id === meId
}

export function canDeleteComment(
  c: Pick<ProposalComment, 'author_id'>,
  meId: string | null,
  isTech: boolean
): boolean {
  return isTech || canEditComment(c, meId)
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif)$/i
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/** Separa o que pode entrar nas imagens da proposta (que já tem currentCount). */
export function pickImageFiles<T extends { name: string; type: string; size: number }>(
  currentCount: number,
  files: T[]
): { accepted: T[]; errors: string[] } {
  const accepted: T[] = []
  const errors: string[] = []
  let overLimit = false
  for (const file of files) {
    if (!IMAGE_TYPES.has(file.type) && !IMAGE_EXTENSIONS.test(file.name)) {
      errors.push(`"${file.name}" não é uma imagem (PNG, JPG, WebP ou GIF).`)
    } else if (file.size > MAX_IMAGE_BYTES) {
      errors.push(`"${file.name}" tem mais de 8 MB.`)
    } else if (currentCount + accepted.length >= MAX_IMAGES) {
      overLimit = true
    } else {
      accepted.push(file)
    }
  }
  if (overLimit) errors.push(`Máximo de ${MAX_IMAGES} imagens por proposta.`)
  return { accepted, errors }
}

/** Ids das pessoas escolhidas no autocomplete que ainda estão marcadas no texto. */
export function mentionIdsIn(body: string, picked: ReadonlyMap<string, string>): string[] {
  const ids = new Set<string>()
  for (const [username, id] of picked) {
    if (mentionsUser(body, username)) ids.add(id)
  }
  return [...ids].slice(0, MAX_MENTIONS)
}

/** Junta o card vindo do tempo real mantendo o voto de quem está logado; arquivado sai do quadro. */
export function mergeProposal(list: Proposal[], incoming: Proposal): Proposal[] {
  // Card arquivado não fica no quadro (um evento de comentário/voto não o devolve).
  if (incoming.archived_at) return list.filter((p) => p.id !== incoming.id)
  const current = list.find((p) => p.id === incoming.id)
  const merged = { ...incoming, my_vote: incoming.my_vote ?? current?.my_vote ?? null }
  if (!current) return [merged, ...list]
  return list.map((p) => (p.id === incoming.id ? merged : p))
}
