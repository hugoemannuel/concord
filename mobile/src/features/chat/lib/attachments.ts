import type { Attachment, AttachmentKind } from '../api/messages'

/**
 * Tamanho da caixa de uma imagem/vídeo na conversa: cabe em max mantendo a
 * proporção e nunca aumenta. Reservado antes de carregar para a lista não pular.
 * Mesma regra do desktop; o máximo cai para a largura da tela no celular.
 */
export function fitMedia(
  width?: number | null,
  height?: number | null,
  max = { width: 400, height: 300 }
): { width: number; height: number } {
  if (!width || !height || width <= 0 || height <= 0) return { width: max.width, height: Math.round((max.width * 9) / 16) }
  const scale = Math.min(1, max.width / width, max.height / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Caixa do GIF: lado maior até 300, proporção mantida (como o desktop). */
export function fitGif(width?: number, height?: number): { width: number; height: number } | null {
  if (!width || !height) return null
  const ratio = width / height
  if (ratio > 1) {
    const w = Math.min(width, 300)
    return { width: w, height: Math.round(w / ratio) }
  }
  const h = Math.min(height, 300)
  return { width: Math.round(h * ratio), height: h }
}

const decimal = (value: number): string => String(Math.round(value * 10) / 10).replace('.', ',')

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${decimal(bytes / 1024)} KB`
  return `${decimal(bytes / (1024 * 1024))} MB`
}

export function mediaFileUrl(apiBaseUrl: string, attachmentId: string, token: string): string {
  return `${apiBaseUrl}/media/${attachmentId}?token=${encodeURIComponent(token)}`
}

export function stickerFileUrl(apiBaseUrl: string, stickerId: string, token?: string | null): string {
  const query = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${apiBaseUrl}/stickers/${encodeURIComponent(stickerId)}/file${query}`
}

/** Imagens/vídeos ficam lado a lado; áudios, um por linha. */
export function splitAttachments(attachments: Attachment[]): { visual: Attachment[]; audios: Attachment[] } {
  return { visual: attachments.filter((a) => a.kind !== 'audio'), audios: attachments.filter((a) => a.kind === 'audio') }
}

// Limites iguais aos do backend (internal/platform/media e internal/message).
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const MAX_ATTACHMENTS_PER_MESSAGE = 10

/** Um arquivo escolhido no aparelho (galeria, câmera ou seletor de arquivos). */
export interface PickedFile {
  uri: string
  name: string
  /** Tipo MIME; vazio quando o sistema não informa (acontece com .m4a). */
  mimeType: string
  size: number
  width?: number
  height?: number
  duration_ms?: number
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

// Só quando o sistema não informa o tipo.
const KIND_BY_EXTENSION: Record<string, AttachmentKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image',
  mp4: 'video', webm: 'video', mp3: 'audio', ogg: 'audio', wav: 'audio', m4a: 'audio'
}

function kindOf(file: Pick<PickedFile, 'name' | 'mimeType'>): AttachmentKind | null {
  const mime = file.mimeType.split(';')[0].trim().toLowerCase()
  if (KIND_BY_MIME[mime]) return KIND_BY_MIME[mime]
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
  return KIND_BY_EXTENSION[ext] ?? null
}

export function classifyFile(file: PickedFile): { ok: true; kind: AttachmentKind } | { ok: false; error: string } {
  const kind = kindOf(file)
  if (!kind) {
    return { ok: false, error: `"${file.name}" não é um tipo aceito. Envie fotos (png, jpg, webp, gif), vídeos (mp4, webm) ou áudios (mp3, ogg, wav, m4a).` }
  }
  if (file.size <= 0) return { ok: false, error: `"${file.name}" está vazio.` }
  if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, error: `"${file.name}" tem mais de 25 MB.` }
  return { ok: true, kind }
}

/** Separa o que pode entrar no rascunho (que já tem currentCount anexos). */
export function acceptFiles(currentCount: number, files: PickedFile[]): { accepted: { file: PickedFile; kind: AttachmentKind }[]; errors: string[] } {
  const accepted: { file: PickedFile; kind: AttachmentKind }[] = []
  const errors: string[] = []
  let overLimit = false
  for (const file of files) {
    const result = classifyFile(file)
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

/** Um arquivo no campo de envio, subindo ou já no servidor. */
export interface DraftAttachment {
  localId: string
  file: PickedFile
  kind: AttachmentKind
  status: 'uploading' | 'done' | 'error'
  progress: number
  attachment?: Attachment
  error?: string
}

type DraftLike = Pick<DraftAttachment, 'status' | 'attachment'>

export function draftStatus(drafts: DraftLike[]): { readyIds: string[]; uploading: boolean; failed: boolean } {
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

/** Dá para enviar: nada subindo nem com erro, e há texto ou anexo pronto. */
export function canSubmit(text: string, drafts: DraftLike[]): boolean {
  const { readyIds, uploading, failed } = draftStatus(drafts)
  if (uploading || failed) return false
  return text.trim().length > 0 || readyIds.length > 0
}
