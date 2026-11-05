import { Perm } from '../../servers/lib/permissions'
import { MAX_EMOJIS_PER_SERVER } from '../../emojis/api/emojis'
import { emojiNameError } from '../../emojis/lib/emojiUpload'

// Regras da gestão de emojis, figurinhas e sons nas configurações do servidor.
// São as mesmas do backend; o app só usa para mostrar ou travar botões.

export type ExpressionKind = 'emoji' | 'sticker' | 'sound'

export const MAX_STICKERS_PER_SERVER = 60
export const MAX_SOUNDS_PER_SERVER = 50
const MAX_NAME_LEN = 32

export const ERROR_TEXT_NAME = 'O nome precisa ter de 1 a 32 caracteres.'

const KINDS: Record<ExpressionKind, { addPerm: number; limit: number; plural: string }> = {
  emoji: { addPerm: Perm.ADD_EMOJIS, limit: MAX_EMOJIS_PER_SERVER, plural: 'emojis' },
  sticker: { addPerm: Perm.ADD_STICKERS, limit: MAX_STICKERS_PER_SERVER, plural: 'figurinhas' },
  sound: { addPerm: Perm.ADD_SOUNDS, limit: MAX_SOUNDS_PER_SERVER, plural: 'sons' }
}

/** Pode enviar um novo desse tipo ao servidor. */
export function canAddExpression(kind: ExpressionKind, perms: number): boolean {
  return (perms & KINDS[kind].addPerm) !== 0
}

/** Pode editar e apagar: quem enviou ou quem tem Gerenciar expressões. */
export function canManageExpression(
  item: { uploader_id: string },
  meId: string | undefined,
  perms: number
): boolean {
  if (meId && item.uploader_id === meId) return true
  return (perms & Perm.MANAGE_EXPRESSIONS) !== 0
}

/** O servidor já chegou ao limite desse tipo. */
export function isExpressionFull(kind: ExpressionKind, count: number): boolean {
  return count >= KINDS[kind].limit
}

/** "3 de 50 emojis". */
export function expressionCountText(kind: ExpressionKind, count: number): string {
  const { limit, plural } = KINDS[kind]
  return `${count} de ${limit} ${plural}`
}

/** Erro do nome novo, ou null se dá para salvar. */
export function expressionNameError(kind: ExpressionKind, name: string): string | null {
  if (kind === 'emoji') return emojiNameError(name)
  const length = [...name.trim()].length
  return length >= 1 && length <= MAX_NAME_LEN ? null : ERROR_TEXT_NAME
}

/** "1,5 s". */
export function formatSoundDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`
}
