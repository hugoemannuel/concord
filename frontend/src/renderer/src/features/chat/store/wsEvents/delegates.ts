// Eventos de outras features: vão direto para o store dono. A ordem importa
// (o primeiro que casa leva): prefixos mais específicos antes dos gerais.
import type { WsEvent } from '../../../../shared/api/ws'
import { ping } from './alerts'
import { APP_UPDATE_EVENT, requestUpdateCheck } from '../../../updates/lib/appUpdate'
import { useSoundboardStore } from '../../../call/store/soundboardStore'
import { useMusicStore } from '../../../music/store/musicStore'
import { useActivityStore } from '../../../activity/store/activityStore'
import { useCallStore } from '../../../call/store/callStore'
import { useTypingStore } from '../typingStore'
import { useLevelStore } from '../../../levels/store/levelStore'
import { useBoostStore } from '../../../levels/store/boostStore'
import { useBadgeStore } from '../../../levels/store/badgeStore'
import { useProposalStore } from '../../../proposals/store/proposalStore'
import { useArchivedProposalStore } from '../../../proposals/store/archivedProposalStore'
import { useNotifySettingsStore } from '../../../notifications/store/notifySettingsStore'
import { handleGuestWsEvent } from '../../../guests/store/guestWsEvents'
import { useEmojiStore } from '../../../emojis/store/emojiStore'
import { proposalMentionNotification } from '../../../notifications/lib/notifications'
import { showToast } from '../../../../shared/store/toastStore'

type Match = (type: string) => boolean
type Delegate = (event: WsEvent) => void

const is =
  (...types: string[]): Match =>
  (type) =>
    types.includes(type)
const prefix =
  (start: string): Match =>
  (type) =>
    type.startsWith(start)

/** Marcaram você num comentário de proposta: som + notificação (Não perturbe silencia). */
export function handleProposalMention(event: WsEvent): void {
  useProposalStore.getState().handleWsEvent(event)
  const mention = event.payload as Parameters<typeof proposalMentionNotification>[0] | null
  if (!mention?.proposal_id) return
  ping(proposalMentionNotification(mention))
  showToast.info(`${mention.author_name} te marcou na proposta "${mention.proposal_title}"`)
}

export const DELEGATES: Array<[Match, Delegate]> = [
  [is(APP_UPDATE_EVENT), () => requestUpdateCheck()],
  [
    (t) => t === 'call:soundboard' || t.startsWith('soundboard:'),
    (e) => useSoundboardStore.getState().handleWsEvent(e)
  ],
  [prefix('music:'), (e) => useMusicStore.getState().handleWsEvent(e)],
  [prefix('call:activity'), (e) => useActivityStore.getState().handleWsEvent(e)],
  [prefix('call:'), (e) => useCallStore.getState().handleWsEvent(e)],
  [is('typing', 'typing:stop'), (e) => useTypingStore.getState().handleWsEvent(e)],
  [prefix('level:'), (e) => useLevelStore.getState().handleWsEvent(e)],
  [is('voice:boost'), (e) => useBoostStore.getState().handleWsEvent(e)],
  [prefix('badge:'), (e) => useBadgeStore.getState().handleWsEvent(e)],
  [is('proposal:mention'), handleProposalMention],
  [
    is('proposal:archive', 'proposal:unarchive'),
    (e) => useArchivedProposalStore.getState().handleWsEvent(e)
  ],
  [prefix('notification-settings:'), (e) => useNotifySettingsStore.getState().handleWsEvent(e)],
  [prefix('proposal:'), (e) => useProposalStore.getState().handleWsEvent(e)],
  [prefix('guest:'), handleGuestWsEvent],
  [prefix('emoji:'), (e) => useEmojiStore.getState().handleWsEvent(e)]
]

/** Repassa o evento ao store dono. true = era de outra feature. */
export function delegateWsEvent(event: WsEvent): boolean {
  const route = DELEGATES.find(([match]) => match(event.type))
  route?.[1](event)
  return Boolean(route)
}
