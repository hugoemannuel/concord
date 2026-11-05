import {
  isMutedNow,
  MUTE_DURATIONS,
  muteUntil,
  type NotifySettings
} from '../../notifications/lib/notificationMute'

/** O que o item "Silenciar servidor" oferece agora. */
export type ServerMuteChoice =
  | { kind: 'unmute' }
  | { kind: 'durations'; options: { label: string; ms: number | null }[] }

/** Silenciado (e dentro do prazo) → reativar; senão as durações do app. */
export function serverMuteChoice(
  current: NotifySettings | undefined,
  now: number
): ServerMuteChoice {
  return isMutedNow(current, now)
    ? { kind: 'unmute' }
    : { kind: 'durations', options: MUTE_DURATIONS }
}

/** O nível e o resto ficam como estavam; muda só o silêncio. */
export function mutedSettings(
  current: NotifySettings,
  ms: number | null,
  now: number
): NotifySettings {
  return { ...current, muted: true, muted_until: muteUntil(ms, now) }
}

export function unmutedSettings(current: NotifySettings): NotifySettings {
  return { ...current, muted: false, muted_until: null }
}
