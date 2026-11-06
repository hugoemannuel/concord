import { errorMessage } from '../../../shared/lib/errorMessage'
import { EMOJI_ACCEPT, MAX_EMOJI_BYTES } from '../api/emojis'
import { normalizeSearch } from './baseEmojis'
import { isValidEmojiName } from './emojiToken'

// Textos aprovados (plano dos emojis, seção "Textos").
export const ERROR_TOO_LARGE = 'Arquivo grande demais (máx. 256 KB).'
export const ERROR_FORMAT = 'Só imagens PNG, JPEG, WEBP, AVIF ou GIF.'
export const ERROR_NAME = 'O nome precisa ter de 2 a 32 letras, números ou _.'
export const ERROR_GENERIC = 'Não foi possível enviar o emoji.'

/** Erros do servidor que já são texto aprovado (backend/internal/emoji/model.go). */
const SERVER_ERRORS = new Set([
  ERROR_NAME,
  ERROR_TOO_LARGE,
  ERROR_FORMAT,
  'Já existe um emoji com esse nome neste servidor.',
  'Este servidor já tem 50 emojis.',
  'Você não tem permissão para adicionar emojis neste servidor.'
])

/** Mensagem para quem envia: só texto aprovado (erros técnicos viram a genérica). */
export function uploadErrorMessage(err: unknown): string {
  const message = errorMessage(err, '')
  if (SERVER_ERRORS.has(message)) return message
  const status = (err as { status?: number } | null)?.status
  if (status === 413) return ERROR_TOO_LARGE
  if (status === 415) return ERROR_FORMAT
  return ERROR_GENERIC
}

const ACCEPTED = new Set(EMOJI_ACCEPT.split(','))

/** Erro do arquivo escolhido, ou null se dá para enviar. */
export function emojiFileError(file: { size: number; type: string }): string | null {
  if (!ACCEPTED.has(file.type)) return ERROR_FORMAT
  if (file.size > MAX_EMOJI_BYTES) return ERROR_TOO_LARGE
  return null
}

export function emojiNameError(name: string): string | null {
  return isValidEmojiName(name) ? null : ERROR_NAME
}

/** Sugestão de nome a partir do arquivo: "Gato Feliz!.png" → "Gato_Feliz". */
export function emojiNameFromFile(filename: string): string {
  return normalizeSearch(filename.replace(/\.[^/.]+$/, ''))
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
}

export interface PickedFile {
  error: string | null
  file: File | null
  /** Nome sugerido (mantém o que a pessoa já digitou). */
  name: string
}

/** Arquivo escolhido no "Novo emoji": aceita ou explica por que não. */
export function pickEmojiFile(selected: File | undefined, currentName: string): PickedFile {
  if (!selected) return { error: null, file: null, name: currentName }
  const error = emojiFileError(selected)
  if (error) return { error, file: null, name: currentName }
  return { error: null, file: selected, name: currentName || emojiNameFromFile(selected.name) }
}

/** Envia o emoji; devolve a mensagem de erro (do app ou do servidor) ou null. */
export async function sendEmoji(
  upload: (serverId: string, name: string, file: Blob) => Promise<unknown>,
  serverId: string,
  name: string,
  file: File | null
): Promise<string | null> {
  const nameError = emojiNameError(name)
  if (nameError || !file) return nameError ?? ERROR_FORMAT
  try {
    await upload(serverId, name, file)
    return null
  } catch (err) {
    return uploadErrorMessage(err)
  }
}
