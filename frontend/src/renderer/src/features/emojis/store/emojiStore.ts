import { create } from 'zustand'
import type { WsEvent } from '../../../shared/api/ws'
import { EMOTE_CATEGORIES, type EmoteCategory } from '../../chat/lib/emotes'
import { basePackToCategories } from '../lib/baseEmojis'
import {
  type CustomEmoji,
  type ServerEmojis,
  deleteServerEmoji,
  fetchBasePack,
  fetchMyEmojis,
  uploadServerEmoji
} from '../api/emojis'
import { updateServerEmoji } from '../../expressions/api/expressions'

// Emojis personalizados dos servidores da pessoa e o pack base. Uma carga por
// sessão; depois só eventos do ws (emoji:created/updated/deleted) e recarga explícita
// quando a lista de servidores muda (ver watchServers).

interface EmojiState {
  groups: ServerEmojis[]
  byId: Record<string, CustomEmoji>
  loaded: boolean
  /** Categorias do pack base (null até carregar). */
  base: EmoteCategory[] | null
  ensureLoaded: () => Promise<void>
  reload: () => Promise<void>
  ensureBase: () => Promise<void>
  upload: (serverId: string, name: string, file: Blob) => Promise<CustomEmoji>
  /** Troca o nome (o arquivo fica). */
  rename: (serverId: string, emojiId: string, name: string) => Promise<CustomEmoji>
  remove: (serverId: string, emojiId: string) => Promise<void>
  handleWsEvent: (event: WsEvent) => boolean
}

let loading: Promise<void> | null = null
let again = false
let loadingBase: Promise<void> | null = null

function indexById(groups: ServerEmojis[]): Record<string, CustomEmoji> {
  const byId: Record<string, CustomEmoji> = {}
  for (const g of groups) for (const e of g.emojis) byId[e.id] = e
  return byId
}

const withGroups = (groups: ServerEmojis[]): Pick<EmojiState, 'groups' | 'byId'> => ({
  groups,
  byId: indexById(groups)
})

/** Põe o emoji no grupo do servidor; null se a pessoa ainda não tem esse grupo. */
export function addEmoji(groups: ServerEmojis[], emoji: CustomEmoji): ServerEmojis[] | null {
  const i = groups.findIndex((g) => g.server_id === emoji.server_id)
  if (i < 0) return null
  if (groups[i].emojis.some((e) => e.id === emoji.id)) return groups
  const next = [...groups]
  next[i] = { ...groups[i], emojis: [...groups[i].emojis, emoji] }
  return next
}

export function removeEmoji(groups: ServerEmojis[], emojiId: string): ServerEmojis[] {
  return groups
    .map((g) => ({ ...g, emojis: g.emojis.filter((e) => e.id !== emojiId) }))
    .filter((g) => g.emojis.length > 0)
}

/** Troca o emoji editado; se ele não está na lista, devolve a mesma. */
export function replaceEmoji(groups: ServerEmojis[], emoji: CustomEmoji): ServerEmojis[] {
  const i = groups.findIndex((g) => g.emojis.some((e) => e.id === emoji.id))
  if (i < 0) return groups
  const next = [...groups]
  next[i] = { ...groups[i], emojis: groups[i].emojis.map((e) => (e.id === emoji.id ? emoji : e)) }
  return next
}

interface EmojiPayload {
  emoji?: CustomEmoji
  emoji_id?: string
}

/** Aplica o valor do evento, se veio; diz se tratou. */
function applyIf<T>(value: T | undefined, apply: (v: T) => void): boolean {
  if (!value) return false
  apply(value)
  return true
}

export const useEmojiStore = create<EmojiState>((set, get) => {
  const applyCreated = (emoji: CustomEmoji): void => {
    const next = addEmoji(get().groups, emoji)
    if (next) set(withGroups(next))
    else void get().reload()
  }

  const applyUpdated = (emoji: CustomEmoji): void => {
    const next = replaceEmoji(get().groups, emoji)
    if (next !== get().groups) set(withGroups(next))
  }

  const applyDeleted = (emojiId: string): void => set(withGroups(removeEmoji(get().groups, emojiId)))

  /** Cada evento: o tratador, se o payload traz o que ele precisa. */
  const wsHandlers: Record<string, (p: EmojiPayload) => boolean> = {
    'emoji:created': (p) => applyIf(p.emoji, applyCreated),
    'emoji:updated': (p) => applyIf(p.emoji, applyUpdated),
    'emoji:deleted': (p) => applyIf(p.emoji_id, applyDeleted)
  }

  return {
    groups: [],
    byId: {},
    loaded: false,
    base: null,

    ensureLoaded: () => {
      if (get().loaded) return Promise.resolve()
      return loading ?? get().reload()
    },

    reload: () => {
      // Pediu de novo no meio de uma carga (ex.: emoji de um servidor novo):
      // a carga atual pode já estar velha, então roda outra quando ela acabar.
      if (loading) {
        again = true
        return loading
      }
      loading = fetchMyEmojis()
        .then((groups) => set({ ...withGroups(groups), loaded: true }))
        .catch(() => {})
        .finally(() => {
          loading = null
          if (again) {
            again = false
            void get().reload()
          }
        })
      return loading
    },

    ensureBase: () => {
      if (get().base) return Promise.resolve()
      loadingBase ??= fetchBasePack()
        .then((pack) => set({ base: basePackToCategories(pack) }))
        .catch(() => set({ base: EMOTE_CATEGORIES }))
        .finally(() => {
          loadingBase = null
        })
      return loadingBase
    },

    upload: async (serverId, name, file) => {
      const created = await uploadServerEmoji(serverId, name, file)
      applyCreated(created)
      return created
    },

    rename: async (serverId, emojiId, name) => {
      const updated = await updateServerEmoji(serverId, emojiId, name)
      applyUpdated(updated)
      return updated
    },

    remove: async (serverId, emojiId) => {
      await deleteServerEmoji(serverId, emojiId)
      applyDeleted(emojiId)
    },

    handleWsEvent: (event) => {
      if (!get().loaded) return event.type.startsWith('emoji:')
      const handler = wsHandlers[event.type]
      return handler ? handler((event.payload ?? {}) as EmojiPayload) : false
    }
  }
})

/** Volta ao estado inicial (logout e testes). */
export function resetEmojiStore(): void {
  loading = null
  again = false
  loadingBase = null
  useEmojiStore.setState({ groups: [], byId: {}, loaded: false, base: null })
}
