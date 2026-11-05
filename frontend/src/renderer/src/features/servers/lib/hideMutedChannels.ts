import { isMutedNow, type NotifySettings } from '../../notifications/lib/notificationMute'

interface HideMutedInput {
  /** Silenciar é o do próprio canal: com o servidor silenciado, a lista não fica vazia. */
  settings: Record<string, NotifySettings>
  unreadByRoom: Record<string, number>
  mentionsByRoom: Record<string, number>
  activeChannelId?: string
  now: number
}

/** O canal some da lista: silenciado, sem nada novo e não é o que está aberto. */
export function hidesChannel(channelId: string, input: HideMutedInput): boolean {
  if (channelId === input.activeChannelId || !isMutedNow(input.settings[channelId], input.now)) return false
  const room = `channel:${channelId}`
  return (input.unreadByRoom[room] ?? 0) === 0 && (input.mentionsByRoom[room] ?? 0) === 0
}
