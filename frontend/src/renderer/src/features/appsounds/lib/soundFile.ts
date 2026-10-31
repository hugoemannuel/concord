import { ApiError } from '../../../shared/api/client'

// Regras do áudio próprio de um evento (as mesmas do backend: appsound/file.go).

export const MAX_APP_SOUND_BYTES = 1024 * 1024
export const MIN_APP_SOUND_MS = 100
export const MAX_APP_SOUND_MS = 5_000

/** Tipos do seletor de arquivo. */
export const APP_SOUND_ACCEPT =
  'audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.ogg,.wav,.m4a'

const TYPES = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/x-m4a']
const EXTENSION = /\.(mp3|ogg|wav|m4a)$/i

const TYPE_ERROR = 'Use um áudio MP3, OGG, WAV ou M4A.'
const SIZE_ERROR = 'O som pode ter até 1 MB.'
const DURATION_ERROR = 'O som precisa ter entre 0,1 s e 5 s.'

/** Erro do arquivo escolhido (antes de ler a duração), ou null. */
export function appSoundFileError(file: File): string | null {
  const known = file.type ? TYPES.includes(file.type) : EXTENSION.test(file.name)
  if (!known) return TYPE_ERROR
  return file.size > MAX_APP_SOUND_BYTES ? SIZE_ERROR : null
}

/** Erro da duração lida do arquivo, ou null. */
export function appSoundDurationError(ms: number | null | undefined): string | null {
  const ok = typeof ms === 'number' && ms >= MIN_APP_SOUND_MS && ms <= MAX_APP_SOUND_MS
  return ok ? null : DURATION_ERROR
}

// O backend responde em inglês: o app mostra a regra em português.
const SERVER_ERRORS: Record<number, string> = {
  400: DURATION_ERROR,
  413: SIZE_ERROR,
  415: TYPE_ERROR,
  507: 'O servidor está sem espaço agora. Tente mais tarde.'
}

/** Mensagem para um erro ao salvar ou remover o som. */
export function appSoundSaveError(err: unknown): string {
  const known = err instanceof ApiError ? SERVER_ERRORS[err.status] : undefined
  return known ?? 'Não foi possível salvar o som.'
}
