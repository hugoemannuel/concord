import type { Attachment, AttachmentKind } from '../api/messages'
import type { Preview } from './preview'

// Limites iguais aos do backend (internal/platform/media e internal/message).
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const MAX_ATTACHMENTS_PER_MESSAGE = 10

/**
 * O que entra no rascunho: 'media' (comentários de propostas: só foto, vídeo
 * e áudio) ou 'any' (chat: qualquer arquivo; o que não é mídia vira 'file').
 */
export type AcceptMode = 'media' | 'any'

/** `accept` do seletor de mídia (comentários de propostas); o chat aceita tudo. */
export const ACCEPT_ATTRIBUTE =
  'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/x-m4a,audio/webm,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.mp3,.ogg,.wav,.m4a'

export interface FileLike {
  name: string
  type: string
  size: number
}

const KIND_BY_MIME: Record<string, AttachmentKind> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/ogg': 'audio',
  'audio/wav': 'audio',
  'audio/x-wav': 'audio',
  'audio/wave': 'audio',
  'audio/mp4': 'audio',
  'audio/x-m4a': 'audio',
  'audio/m4a': 'audio',
  'audio/webm': 'audio'
}

// Só quando o sistema não informa o tipo (acontece com .m4a no Windows).
const KIND_BY_EXTENSION: Record<string, AttachmentKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  mp4: 'video',
  webm: 'video',
  mp3: 'audio',
  ogg: 'audio',
  wav: 'audio',
  m4a: 'audio'
}

function kindOf(file: FileLike): AttachmentKind | null {
  const mime = file.type.split(';')[0].trim().toLowerCase()
  if (mime) return KIND_BY_MIME[mime] ?? null
  const dot = file.name.lastIndexOf('.')
  if (dot < 0) return null
  return KIND_BY_EXTENSION[file.name.slice(dot + 1).toLowerCase()] ?? null
}

export function classifyFile(
  file: FileLike,
  accept: AcceptMode = 'media'
): { ok: true; kind: AttachmentKind } | { ok: false; error: string } {
  const kind = kindOf(file) ?? (accept === 'any' ? 'file' : null)
  if (!kind) {
    return {
      ok: false,
      error: `"${file.name}" não é um tipo aceito. Envie fotos (png, jpg, webp, gif), vídeos (mp4, webm) ou áudios (mp3, ogg, wav, m4a).`
    }
  }
  if (file.size <= 0) return { ok: false, error: `"${file.name}" está vazio.` }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: `"${file.name}" tem mais de 25 MB.` }
  }
  return { ok: true, kind }
}

/** Separa o que pode entrar no rascunho (que já tem currentCount anexos). */
export function acceptFiles<T extends FileLike>(
  currentCount: number,
  files: T[],
  accept: AcceptMode = 'media'
): { accepted: { file: T; kind: AttachmentKind }[]; errors: string[] } {
  const accepted: { file: T; kind: AttachmentKind }[] = []
  const errors: string[] = []
  let overLimit = false
  for (const file of files) {
    const result = classifyFile(file, accept)
    if (!result.ok) {
      errors.push(result.error)
      continue
    }
    if (currentCount + accepted.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
      overLimit = true
      continue
    }
    accepted.push({ file, kind: result.kind })
  }
  if (overLimit) errors.push(`Máximo de ${MAX_ATTACHMENTS_PER_MESSAGE} arquivos por mensagem.`)
  return { accepted, errors }
}

/**
 * Tamanho da caixa de uma imagem/vídeo na conversa: cabe em max mantendo a
 * proporção e nunca aumenta. Reservado antes de carregar para a lista não pular.
 */
export function fitMedia(
  width?: number | null,
  height?: number | null,
  max = { width: 400, height: 300 }
): { width: number; height: number } {
  if (!width || !height || width <= 0 || height <= 0) return { width: 400, height: 225 }
  const scale = Math.min(1, max.width / width, max.height / height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

function decimal(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',')
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${decimal(bytes / 1024)} KB`
  return `${decimal(bytes / (1024 * 1024))} MB`
}

/** 7000 → "0:07"; 65000 → "1:05"; com hora: "1:02:03". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
  return `${minutes}:${seconds}`
}

/** Prévia de mensagem só com anexos (mesmos rótulos do backend). */
export function attachmentPreview(
  attachments: Pick<Attachment, 'kind'>[] | null | undefined
): Preview | null {
  if (!attachments || attachments.length === 0) return null
  if (attachments.length > 1) return { icon: 'attachment', text: `${attachments.length} anexos` }
  switch (attachments[0].kind) {
    case 'image':
      return { icon: 'image', text: 'Imagem' }
    case 'video':
      return { icon: 'video', text: 'Vídeo' }
    case 'file':
      return { icon: 'attachment', text: 'Arquivo' }
    default:
      return { icon: 'audio', text: 'Áudio' }
  }
}

export function uploadErrorMessage(status: number): string {
  switch (status) {
    case 413:
      return 'Arquivo maior que 25 MB.'
    case 415:
      return 'Tipo de arquivo não aceito.'
    case 507:
      return 'Servidor sem espaço para novos arquivos.'
    case 403:
      return 'Você não pode enviar arquivos aqui.'
    default:
      return 'Falha ao enviar o arquivo.'
  }
}

/**
 * Erro ao criar a mensagem. "invalid attachment" é quase sempre um anexo que
 * ficou mais de 24 h no rascunho e foi limpo pelo servidor.
 */
export function sendErrorMessage(status: number, message: string): string {
  if (status === 400 && message === 'invalid attachment') {
    return 'Um dos arquivos expirou; anexe de novo.'
  }
  return message || 'Falha ao enviar mensagem.'
}

export function mediaFileUrl(apiBaseUrl: string, attachmentId: string, token: string): string {
  return `${apiBaseUrl}/media/${attachmentId}?token=${encodeURIComponent(token)}`
}

/** Tipo MIME sem parâmetros e em minúsculas ("image/png; x=1" → "image/png"). */
export function baseMime(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase()
}

/** Arquivo genérico que o servidor detectou como texto (UTF-8): tem prévia. */
export function isTextFile(attachment: Pick<Attachment, 'kind' | 'content_type'>): boolean {
  return attachment.kind === 'file' && baseMime(attachment.content_type) === 'text/plain'
}

/** Imagem e vídeo ganham miniatura (blob:) no rascunho; áudio e arquivo, ícone. */
export function hasVisualPreview(kind: AttachmentKind): boolean {
  return kind === 'image' || kind === 'video'
}

/** Anexos da mensagem por lugar na tela: mídia lado a lado, áudios e arquivos um por linha. */
export function groupAttachments<T extends Pick<Attachment, 'kind'>>(
  attachments: T[]
): { visual: T[]; audios: T[]; files: T[] } {
  return {
    visual: attachments.filter((a) => hasVisualPreview(a.kind)),
    audios: attachments.filter((a) => a.kind === 'audio'),
    files: attachments.filter((a) => a.kind === 'file')
  }
}

/** Formatos copiáveis. GIF fica de fora: a conversão para PNG perderia a animação. */
const COPYABLE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export function canCopyImage(contentType: string): boolean {
  return COPYABLE_IMAGE_TYPES.includes(baseMime(contentType))
}

/**
 * Duração (s) para o player: a do elemento quando é finita; senão a salva no
 * envio (a gravação webm do Chromium vem com duração Infinity).
 */
export function playableDuration(
  elementSeconds: number,
  durationMs?: number | null
): number | null {
  if (Number.isFinite(elementSeconds) && elementSeconds > 0) return elementSeconds
  if (durationMs && durationMs > 0) return durationMs / 1000
  return null
}

/** Um arquivo no campo de envio, subindo ou já no servidor. */
export interface DraftAttachment {
  localId: string
  file: File
  kind: AttachmentKind
  previewUrl: string | null
  status: 'uploading' | 'done' | 'error'
  progress: number
  attachment?: Attachment
  error?: string
}

type DraftLike = Pick<DraftAttachment, 'status' | 'attachment'>

export function draftStatus(drafts: DraftLike[]): {
  readyIds: string[]
  uploading: boolean
  failed: boolean
} {
  const readyIds: string[] = []
  let uploading = false
  let failed = false
  for (const d of drafts) {
    if (d.status === 'uploading') uploading = true
    else if (d.status === 'error') failed = true
    else if (d.attachment) readyIds.push(d.attachment.id)
  }
  return { readyIds, uploading, failed }
}

/** Dá para enviar: fora da espera do modo lento, nada subindo nem com erro, e há texto ou anexo pronto. */
export function canSubmit(text: string, drafts: DraftLike[], slowmodeBlocked = false): boolean {
  const { readyIds, uploading, failed } = draftStatus(drafts)
  if (slowmodeBlocked || uploading || failed) return false
  return text.trim().length > 0 || readyIds.length > 0
}
