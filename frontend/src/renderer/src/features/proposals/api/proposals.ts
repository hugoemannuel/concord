import { uploadMedia, type UploadMeta } from '../../chat/api/attachments'
import { request } from '../../../shared/api/client'
import { uploadTo, type UploadOptions } from '../../../shared/api/upload'
import type { Attachment } from '../../chat/api/messages'

export type ProposalStatus = 'voting' | 'proposed' | 'in_progress' | 'done' | 'rejected'

/** Imagem anexada a uma proposta; `url` é relativa ("/api/proposal-media/<id>"). */
export interface ProposalImage {
  id: string
  url: string
  content_type: string
}

export interface Proposal {
  id: string
  author_id: string
  author_name: string
  author_avatar_url?: string | null
  title: string
  description: string
  status: ProposalStatus
  created_at: string
  voting_ends_at: string
  closed_at?: string | null
  /** Quando o time tech arquivou o card: arquivado some do quadro, mas nada é apagado. */
  archived_at?: string | null
  /** Quando o card entrou na coluna atual: ordena as colunas (o movido sobe ao topo). */
  moved_at?: string | null
  /** Como a votação acabou: `manual` (o time tech moveu o card) ou `deadline` (o prazo venceu). */
  close_reason?: 'manual' | 'deadline' | null
  /** Quem encerrou a votação, quando foi `manual`. */
  closed_by_name?: string | null
  edited_at?: string | null
  github_issue_number?: number | null
  github_issue_url?: string | null
  yes_votes: number
  no_votes: number
  comment_count: number
  images: ProposalImage[]
  /** Quem do time tech está com o card (quem o moveu; arrastar para Concluída não muda). */
  assignee?: ProposalAssignee | null
  /** true = sim, false = não, ausente = não votou. */
  my_vote?: boolean | null
}

export interface ProposalAssignee {
  id: string
  name: string
  avatar_url?: string | null
}

export interface ProposalBoard {
  proposals: Proposal[]
  /** Time tech: pode mover os cards a qualquer hora. */
  is_tech: boolean
  /** Usuário do GitHub de quem é do time tech (assignee das issues). */
  github_username?: string | null
}

export interface ProposalMention {
  id: string
  username: string
  display_name: string
}

/** Anexo de comentário: o mesmo formato do chat, mais a URL pública do arquivo. */
export type ProposalAttachment = Attachment & { url: string }

export interface ProposalReaction {
  emoji: string
  count: number
  user_ids: string[]
}

/** Prévia do comentário respondido. */
export interface ProposalCommentReply {
  id: string
  author_id: string
  author_name: string
  body: string
}

export interface ProposalComment {
  id: string
  proposal_id: string
  author_id: string
  author_name: string
  author_avatar_url?: string | null
  body: string
  created_at: string
  edited_at?: string | null
  mentions: ProposalMention[]
  /** Comentário respondido; `reply_to` some se o original foi apagado. */
  reply_to_id?: string | null
  reply_to?: ProposalCommentReply | null
  reactions: ProposalReaction[]
  attachments: ProposalAttachment[]
}

/** Menção ainda não vista (GET /proposals/mentions e o evento proposal:mention). */
export interface PendingProposalMention {
  proposal_id: string
  comment_id: string
  proposal_title: string
  author_name: string
  snippet: string
  created_at: string
}

export function listProposals(): Promise<ProposalBoard> {
  return request<ProposalBoard>('/proposals')
}

export function createProposal(
  title: string,
  description: string,
  imageIds: string[]
): Promise<Proposal> {
  return request<Proposal>('/proposals', {
    method: 'POST',
    body: JSON.stringify({ title, description, image_ids: imageIds })
  })
}

export function updateProposal(
  id: string,
  title: string,
  description: string,
  imageIds: string[]
): Promise<Proposal> {
  return request<Proposal>(`/proposals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title, description, image_ids: imageIds })
  })
}

export function voteProposal(id: string, approve: boolean): Promise<Proposal> {
  return request<Proposal>(`/proposals/${id}/vote`, {
    method: 'PUT',
    body: JSON.stringify({ approve })
  })
}

export function removeProposalVote(id: string): Promise<Proposal> {
  return request<Proposal>(`/proposals/${id}/vote`, { method: 'DELETE' })
}

/**
 * Move o card. `takeOver`: confirmou tirar o card do dev que estava com ele
 * (sem isso o servidor responde 409 `assignee_conflict`).
 */
export function setProposalStatus(
  id: string,
  status: ProposalStatus,
  takeOver = false
): Promise<Proposal> {
  return request<Proposal>(`/proposals/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, take_over: takeOver })
  })
}

/** Guarda o usuário do GitHub de quem é do time tech ("" apaga). */
export async function setGithubUsername(username: string): Promise<string | null> {
  const res = await request<{ github_username: string | null }>('/proposals/github-username', {
    method: 'PUT',
    body: JSON.stringify({ username })
  })
  return res.github_username ?? null
}

export function deleteProposal(id: string): Promise<void> {
  return request<void>(`/proposals/${id}`, { method: 'DELETE' })
}

export async function listProposalComments(id: string): Promise<ProposalComment[]> {
  const res = await request<{ comments: ProposalComment[] }>(`/proposals/${id}/comments`)
  return Array.isArray(res.comments) ? res.comments : []
}

export function createProposalComment(
  id: string,
  body: string,
  mentions: string[],
  replyToId: string | null = null,
  attachmentIds: string[] = []
): Promise<ProposalComment> {
  return request<ProposalComment>(`/proposals/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      body,
      mentions,
      reply_to_id: replyToId,
      attachment_ids: attachmentIds
    })
  })
}

export function reactToProposalComment(
  id: string,
  commentId: string,
  emoji: string
): Promise<ProposalComment> {
  return request<ProposalComment>(`/proposals/${id}/comments/${commentId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji })
  })
}

export function unreactProposalComment(
  id: string,
  commentId: string,
  emoji: string
): Promise<ProposalComment> {
  const query = new URLSearchParams({ emoji })
  return request<ProposalComment>(
    `/proposals/${id}/comments/${commentId}/reactions?${query.toString()}`,
    { method: 'DELETE' }
  )
}

/** Sobe um anexo de comentário (fica pendente até o comentário ser criado com a id dele). */
export function uploadCommentAttachment(
  file: Blob,
  meta: UploadMeta,
  opts: UploadOptions = {}
): Promise<ProposalAttachment> {
  return uploadMedia<ProposalAttachment>('/proposal-comment-media', file, meta, opts)
}

export function updateProposalComment(
  id: string,
  commentId: string,
  body: string
): Promise<ProposalComment> {
  return request<ProposalComment>(`/proposals/${id}/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ body })
  })
}

export function deleteProposalComment(id: string, commentId: string): Promise<void> {
  return request<void>(`/proposals/${id}/comments/${commentId}`, { method: 'DELETE' })
}

export async function listProposalMentions(): Promise<PendingProposalMention[]> {
  const res = await request<{ mentions: PendingProposalMention[] }>('/proposals/mentions')
  return Array.isArray(res.mentions) ? res.mentions : []
}

/** Marca como vistas as menções de uma proposta; sem id, todas. */
export function markProposalMentionsSeen(proposalId?: string): Promise<void> {
  return request<void>('/proposals/mentions/seen', {
    method: 'POST',
    body: JSON.stringify(proposalId ? { proposal_id: proposalId } : {})
  })
}

/**
 * Sobe uma imagem (fica "pendente" até a proposta ser criada ou editada com o
 * id dela). Progresso, cancelamento e renovação do token: ver uploadTo.
 */
export function uploadProposalImage(
  file: Blob,
  filename: string,
  opts: UploadOptions = {}
): Promise<ProposalImage> {
  return uploadTo<ProposalImage>('/proposal-media', { files: [{ field: 'file', blob: file, filename }] }, opts)
}
