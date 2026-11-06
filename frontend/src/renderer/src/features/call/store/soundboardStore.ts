import { create } from 'zustand'
import type { WsEvent } from '../../../shared/api/ws'
import {
  deleteServerSound,
  listMySounds,
  listServerSounds,
  uploadServerSound,
  type SoundboardItem,
  type UploadSoundboardInput
} from '../api/soundboard'
import {
  playSoundboardClip,
  setActiveSoundboardVolume,
  stopAllSoundboardAudio
} from '../lib/soundboardPlayer'
import { useCallStore, type CallUserInfo } from './callStore'
import { useChatStore } from '../../chat/store/chatStore'
import { showToast } from '../../../shared/store/toastStore'
import { useUserAudioStore } from './userAudioStore'
import { useSoundFavoritesStore } from './soundFavoritesStore'
import { legacyFavoriteIds, SOUNDBOARD_PREFS_KEY } from '../lib/legacySoundFavorites'
import {
  editServerSounds,
  prependSound,
  replaceSound,
  withoutSound,
  type SoundListEdit
} from '../lib/serverSoundList'
import { updateServerSound, type SoundUpdate } from '../../expressions/api/expressions'
const DEFAULT_VOLUME = 0.8

/** Preferências locais da mesa (os favoritos ficam no servidor: soundFavoritesStore). */
export interface SoundboardPrefs {
  volume: number
  keybinds: Record<string, string>
}

export interface ActiveSoundPlay {
  soundId: string
  soundName: string
  emoji?: string | null
  playToken: number
}

interface CallSoundboardPayload {
  call_id: string
  sound: {
    id: string
    server_id: string
    name: string
    emoji?: string | null
    duration_ms: number
  }
  user: CallUserInfo
}

/** soundboard:created e soundboard:updated. */
interface SoundboardSoundPayload {
  server_id: string
  sound: SoundboardItem
}

interface SoundboardDeletedPayload {
  server_id: string
  sound_id: string
}

function loadPrefs(): SoundboardPrefs {
  try {
    const raw = localStorage.getItem(SOUNDBOARD_PREFS_KEY)
    if (!raw) return { volume: DEFAULT_VOLUME, keybinds: {} }
    const parsed = JSON.parse(raw) as Partial<SoundboardPrefs>
    const volume =
      typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
        ? Math.max(0, Math.min(1, parsed.volume))
        : DEFAULT_VOLUME
    const keybinds =
      parsed.keybinds && typeof parsed.keybinds === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.keybinds).filter(
              ([k, v]) => typeof k === 'string' && typeof v === 'string' && v.trim() !== ''
            )
          )
        : {}
    return { volume, keybinds }
  } catch {
    return { volume: DEFAULT_VOLUME, keybinds: {} }
  }
}

function savePrefs(prefs: SoundboardPrefs): void {
  // Favoritos antigos ainda não levados ao servidor ficam até a migração.
  const legacy = legacyFavoriteIds()
  try {
    localStorage.setItem(
      SOUNDBOARD_PREFS_KEY,
      JSON.stringify(legacy.length > 0 ? { favorites: legacy, ...prefs } : prefs)
    )
  } catch {
    // localStorage indisponível
  }
}

let nextPlayToken = 1
const playTimers = new Map<string, ReturnType<typeof setTimeout>>()

interface SoundboardState {
  volume: number
  keybinds: Record<string, string>
  soundsByServer: Record<string, SoundboardItem[]>
  loadingByServer: Record<string, boolean>
  /** userId -> som sendo reproduzido agora na chamada ativa */
  activePlays: Record<string, ActiveSoundPlay>

  setVolume: (volume: number) => void
  setKeybind: (soundId: string, keybind: string | null) => void
  loadServerSounds: (serverId: string) => Promise<void>
  /** Os sons de todos os servidores da pessoa (a mesa mostra todos, como as figurinhas). */
  loadMine: () => Promise<void>
  uploadSound: (
    serverId: string,
    file: Blob,
    input: UploadSoundboardInput
  ) => Promise<SoundboardItem>
  /** Troca nome e emoji (o áudio fica). */
  updateSound: (serverId: string, soundId: string, input: SoundUpdate) => Promise<SoundboardItem>
  deleteSound: (serverId: string, soundId: string) => Promise<void>
  triggerSound: (soundId: string) => void
  clearActivePlays: () => void
  handleWsEvent: (event: WsEvent) => void
}

const initialPrefs = loadPrefs()

export const useSoundboardStore = create<SoundboardState>()((set, get) => {
  const clearUserPlay = (userId: string, token: number): void => {
    const current = get().activePlays[userId]
    if (!current || current.playToken !== token) return
    const timer = playTimers.get(userId)
    if (timer) {
      clearTimeout(timer)
      playTimers.delete(userId)
    }
    set((s) => {
      if (s.activePlays[userId]?.playToken !== token) return s
      const next = { ...s.activePlays }
      delete next[userId]
      return { activePlays: next }
    })
  }

  const editSounds = (serverId: string, edit: SoundListEdit): void =>
    set((s) => ({ soundsByServer: editServerSounds(s.soundsByServer, serverId, edit) }))

  /** Som criado ou editado: o payload traz o som inteiro. */
  const onSound =
    (toEdit: (sound: SoundboardItem) => SoundListEdit) =>
    (payload: unknown): void => {
      const p = payload as SoundboardSoundPayload
      if (p?.server_id && p?.sound) editSounds(p.server_id, toEdit(p.sound))
    }

  const onSoundDeleted = (payload: unknown): void => {
    const p = payload as SoundboardDeletedPayload
    if (!p?.server_id || !p?.sound_id) return
    useSoundFavoritesStore.getState().forget(p.sound_id)
    editSounds(p.server_id, withoutSound(p.sound_id))
  }

  /** Alguém tocou um som na chamada ativa: marca quem tocou e reproduz. */
  const onCallSoundboard = (payload: unknown): void => {
    const p = payload as CallSoundboardPayload
    const callState = useCallStore.getState()
    if (
      !p?.call_id ||
      callState.status !== 'active' ||
      callState.callId !== p.call_id ||
      !p.sound ||
      !p.user
    ) {
      return
    }

    const userId = p.user.id
    const playToken = nextPlayToken++
    const prevTimer = playTimers.get(userId)
    if (prevTimer) clearTimeout(prevTimer)

    const durationMs = Math.min(Math.max(p.sound.duration_ms || 3000, 500), 16_000)
    const timer = setTimeout(() => {
      clearUserPlay(userId, playToken)
    }, durationMs + 350)
    playTimers.set(userId, timer)

    set((s) => ({
      activePlays: {
        ...s.activePlays,
        [userId]: {
          soundId: p.sound.id,
          soundName: p.sound.name,
          emoji: p.sound.emoji ?? null,
          playToken
        }
      }
    }))

    const locallyMuted = useUserAudioStore.getState().get(userId).muted
    const volume = get().volume
    if (!callState.deafened && !locallyMuted && volume > 0) {
      void playSoundboardClip({
        soundId: p.sound.id,
        volume,
        onEnded: () => clearUserPlay(userId, playToken)
      })
    }
  }

  const wsHandlers: Record<string, (payload: unknown) => void> = {
    'soundboard:created': onSound(prependSound),
    'soundboard:updated': onSound(replaceSound),
    'soundboard:deleted': onSoundDeleted,
    'call:soundboard': onCallSoundboard
  }

  return {
    volume: initialPrefs.volume,
    keybinds: initialPrefs.keybinds,
    soundsByServer: {},
    loadingByServer: {},
    activePlays: {},

    setVolume: (volume) => {
      const clamped = Math.max(0, Math.min(1, volume))
      set({ volume: clamped })
      setActiveSoundboardVolume(clamped)
      savePrefs({ volume: clamped, keybinds: get().keybinds })
    },

    setKeybind: (soundId, keybind) => {
      set((s) => {
        const nextKeybinds = { ...s.keybinds }
        const normalized = keybind?.trim() ?? ''
        if (!normalized) {
          delete nextKeybinds[soundId]
        } else {
          // Remove o mesmo atalho de outro som para evitar conflito
          for (const [otherId, kb] of Object.entries(nextKeybinds)) {
            if (kb.toLowerCase() === normalized.toLowerCase()) {
              delete nextKeybinds[otherId]
            }
          }
          nextKeybinds[soundId] = normalized
        }
        savePrefs({ volume: s.volume, keybinds: nextKeybinds })
        return { keybinds: nextKeybinds }
      })
    },

    loadServerSounds: async (serverId) => {
      if (!serverId) return
      set((s) => ({ loadingByServer: { ...s.loadingByServer, [serverId]: true } }))
      try {
        const list = await listServerSounds(serverId)
        set((s) => ({
          soundsByServer: {
            ...s.soundsByServer,
            [serverId]: Array.isArray(list) ? list : []
          }
        }))
      } catch {
        // falha silenciosa; o usuário pode tentar abrir de novo
      } finally {
        set((s) => ({ loadingByServer: { ...s.loadingByServer, [serverId]: false } }))
      }
    },

    loadMine: async () => {
      try {
        const groups = await listMySounds()
        set((s) => ({
          soundsByServer: {
            ...s.soundsByServer,
            ...Object.fromEntries(groups.map((g) => [g.server_id, g.sounds]))
          }
        }))
      } catch {
        // Sem rede: a mesa fica com o que já tinha carregado.
      }
    },

    uploadSound: async (serverId, file, input) => {
      const created = await uploadServerSound(serverId, file, input)
      editSounds(serverId, prependSound(created))
      return created
    },

    updateSound: async (serverId, soundId, input) => {
      const updated = await updateServerSound(serverId, soundId, input)
      editSounds(serverId, replaceSound(updated))
      return updated
    },

    deleteSound: async (serverId, soundId) => {
      await deleteServerSound(serverId, soundId)
      editSounds(serverId, withoutSound(soundId))
    },

    triggerSound: (soundId) => {
      const { status, type, callId, muted, deafened } = useCallStore.getState()
      if (status !== 'active' || type !== 'channel' || !callId) {
        showToast.error('Entre em um canal de voz do servidor para usar a mesa de áudio.')
        return
      }
      if (muted || deafened) {
        showToast.info('Desative o mudo para tocar áudios na chamada.')
        return
      }
      useChatStore.getState().sendEvent('call:soundboard', {
        call_id: callId,
        sound_id: soundId
      })
    },

    clearActivePlays: () => {
      playTimers.forEach((timer) => clearTimeout(timer))
      playTimers.clear()
      stopAllSoundboardAudio()
      set({ activePlays: {} })
    },

    handleWsEvent: (event) => {
      wsHandlers[event.type]?.(event.payload)
    }
  }
})
