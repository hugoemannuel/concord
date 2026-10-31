import type { Note } from '../../call/lib/sounds'
import { isSoundEvent, type SoundEvent } from './events'
import { DEFAULT_PACK_ID, packSound } from './packs'

// O que tocar em cada evento, a partir do que a pessoa escolheu: o pacote vale
// para todos, o ajuste por evento vence o pacote, e o volume vale para tudo.

/** Escolha por evento: id de pacote, 'custom' (áudio próprio) ou 'off'. */
export type EventChoice = string

export interface AppSoundSettings {
  pack: string
  /** 0 a 200 (%). */
  volume: number
  events: Partial<Record<SoundEvent, EventChoice>>
}

/** Evento → URL do áudio próprio (como o servidor grava: /api/app-sounds/<id>). */
export type CustomSounds = Partial<Record<SoundEvent, string>>

export const MAX_VOLUME = 200
export const DEFAULT_APP_SOUNDS: AppSoundSettings = { pack: DEFAULT_PACK_ID, volume: 100, events: {} }

export type ResolvedSound =
  | { kind: 'off' }
  | { kind: 'notes'; notes: Note[]; gain: number }
  | { kind: 'file'; src: string; gain: number; fallback: Note[] }

// Só o caminho que o backend grava: o app nunca carrega áudio de outro lugar.
const CUSTOM_PATH = /^\/api\/app-sounds\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Endereço do arquivo (com a origem do servidor no desktop), ou null. */
export function customSoundSrc(url: string | undefined, apiBase: string): string | null {
  if (!url || !CUSTOM_PATH.test(url)) return null
  const origin = /^https?:\/\//.test(apiBase) ? new URL(apiBase).origin : ''
  return `${origin}${url}`
}

export function resolveSound(
  event: SoundEvent,
  settings: AppSoundSettings,
  custom: CustomSounds,
  apiBase: string
): ResolvedSound {
  const gain = settings.volume / 100
  const choice = settings.events[event] ?? settings.pack
  if (gain <= 0 || choice === 'off') return { kind: 'off' }
  if (choice !== 'custom') return { kind: 'notes', notes: packSound(choice, event), gain }
  const fallback = packSound(settings.pack, event)
  const src = customSoundSrc(custom[event], apiBase)
  return src ? { kind: 'file', src, gain, fallback } : { kind: 'notes', notes: fallback, gain }
}

/** Valor do seletor do evento: 'pack' = segue o pacote escolhido. */
export function choiceFor(event: SoundEvent, settings: AppSoundSettings): EventChoice {
  return settings.events[event] ?? 'pack'
}

/** As escolhas com o evento trocado ('pack' tira o ajuste). */
export function withChoice(settings: AppSoundSettings, event: SoundEvent, choice: EventChoice): AppSoundSettings {
  const events = { ...settings.events }
  if (choice === 'pack') delete events[event]
  else events[event] = choice
  return { ...settings, events }
}

const clampVolume = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX_VOLUME, Math.max(0, Math.round(v))) : 100

/** Só os eventos conhecidos com valor texto (o servidor pode ser de outra versão). */
function knownEvents(raw: unknown): Partial<Record<SoundEvent, string>> {
  const out: Partial<Record<SoundEvent, string>> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [event, value] of Object.entries(raw)) {
    if (isSoundEvent(event) && typeof value === 'string') out[event] = value
  }
  return out
}

/** O GET /users/me/app-sounds, limpo. */
export function normalizeAppSounds(raw: Record<string, unknown>): {
  settings: AppSoundSettings
  custom: CustomSounds
} {
  return {
    settings: {
      pack: typeof raw.pack === 'string' && raw.pack ? raw.pack : DEFAULT_PACK_ID,
      volume: clampVolume(raw.volume),
      events: knownEvents(raw.events)
    },
    custom: knownEvents(raw.custom)
  }
}
