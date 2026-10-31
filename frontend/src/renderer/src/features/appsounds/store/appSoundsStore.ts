import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { readMediaMeta } from '../../chat/lib/readMediaMeta'
import { deleteAppSound, getAppSounds, saveAppSounds, uploadAppSound } from '../api/appSounds'
import {
  DEFAULT_APP_SOUNDS,
  normalizeAppSounds,
  withChoice,
  type AppSoundSettings,
  type CustomSounds
} from '../lib/choice'
import type { SoundEvent } from '../lib/events'
import { appSoundDurationError, appSoundFileError, appSoundSaveError } from '../lib/soundFile'

/**
 * Sons do app (Configurações → Notificações). As escolhas ficam no servidor
 * (valem em todo aparelho) e numa cópia local, para tocar certo antes de
 * carregar. Mudou: aplica na hora e salva logo depois (o volume arrasta).
 */
interface AppSoundsState {
  settings: AppSoundSettings
  custom: CustomSounds
  busy: { event: SoundEvent; kind: 'upload' | 'remove' } | null
  /** event null = erro ao salvar as escolhas. */
  error: { event: SoundEvent | null; message: string } | null
  load: () => Promise<void>
  update: (next: AppSoundSettings) => void
  upload: (event: SoundEvent, file: File) => Promise<void>
  removeCustom: (event: SoundEvent) => Promise<void>
  reset: () => void
}

export const SAVE_DELAY_MS = 400
const SAVE_ERROR = 'Não foi possível salvar os sons. Tente de novo.'

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useAppSoundsStore = create<AppSoundsState>()(
  persist(
    (set, get) => {
      const apply = (raw: Record<string, unknown>): void => {
        set(normalizeAppSounds(raw))
      }

      const scheduleSave = (): void => {
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          saveTimer = null
          saveAppSounds(get().settings).catch(() => set({ error: { event: null, message: SAVE_ERROR } }))
        }, SAVE_DELAY_MS)
      }

      const update = (next: AppSoundSettings): void => {
        set({ settings: next, error: null })
        scheduleSave()
      }

      /** Erro do arquivo (formato, tamanho, duração) ou a duração medida. */
      const check = async (file: File): Promise<{ error: string } | { ms: number }> => {
        const fileError = appSoundFileError(file)
        if (fileError) return { error: fileError }
        const { duration_ms: ms } = await readMediaMeta(file, 'audio')
        const durationError = appSoundDurationError(ms)
        return durationError || !ms ? { error: durationError ?? '' } : { ms }
      }

      const busyCall = async (
        event: SoundEvent,
        kind: 'upload' | 'remove',
        call: () => Promise<Record<string, unknown>>
      ): Promise<boolean> => {
        set({ busy: { event, kind }, error: null })
        try {
          set({ custom: normalizeAppSounds(await call()).custom })
          return true
        } catch (err) {
          set({ error: { event, message: appSoundSaveError(err) } })
          return false
        } finally {
          set({ busy: null })
        }
      }

      return {
        settings: DEFAULT_APP_SOUNDS,
        custom: {},
        busy: null,
        error: null,

        load: async () => {
          try {
            apply(await getAppSounds())
          } catch {
            // Sem rede: fica a cópia local.
          }
        },

        update,

        upload: async (event, file) => {
          if (get().busy) return
          const checked = await check(file)
          if ('error' in checked) {
            set({ error: { event, message: checked.error } })
            return
          }
          const ok = await busyCall(event, 'upload', () => uploadAppSound(event, file, checked.ms))
          if (ok) update(withChoice(get().settings, event, 'custom'))
        },

        removeCustom: async (event) => {
          if (get().busy) return
          const ok = await busyCall(event, 'remove', () => deleteAppSound(event))
          if (ok && get().settings.events[event] === 'custom') update(withChoice(get().settings, event, 'pack'))
        },

        reset: () => {
          if (saveTimer) clearTimeout(saveTimer)
          saveTimer = null
          set({ settings: DEFAULT_APP_SOUNDS, custom: {}, busy: null, error: null })
        }
      }
    },
    {
      name: 'concord-app-sounds',
      partialize: ({ settings, custom }) => ({ settings, custom })
    }
  )
)
