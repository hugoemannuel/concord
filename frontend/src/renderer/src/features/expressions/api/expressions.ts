import { request } from '../../../shared/api/client'
import type { CustomEmoji } from '../../emojis/api/emojis'
import type { ServerSticker } from '../../chat/api/stickers'
import type { SoundboardItem } from '../../call/api/soundboard'

// Edição dos metadados (o arquivo não muda). Quem pode: quem enviou ou quem
// tem Gerenciar expressões; o servidor confere e avisa a sala do servidor.

const path = (serverId: string, kind: string, id: string): string =>
  `/servers/${encodeURIComponent(serverId)}/${kind}/${encodeURIComponent(id)}`

const patch = <T>(url: string, body: object): Promise<T> =>
  request<T>(url, { method: 'PATCH', body: JSON.stringify(body) })

export function updateServerEmoji(
  serverId: string,
  emojiId: string,
  name: string
): Promise<CustomEmoji> {
  return patch(path(serverId, 'emojis', emojiId), { name })
}

export function updateServerSticker(
  serverId: string,
  stickerId: string,
  name: string
): Promise<ServerSticker> {
  return patch(path(serverId, 'stickers', stickerId), { name: name.trim() })
}

export interface SoundUpdate {
  name: string
  /** Vazio tira o emoji do som. */
  emoji: string
}

export function updateServerSound(
  serverId: string,
  soundId: string,
  input: SoundUpdate
): Promise<SoundboardItem> {
  return patch(path(serverId, 'soundboard', soundId), {
    name: input.name.trim(),
    emoji: input.emoji.trim()
  })
}
