import type { Note, SoundHandler } from '../../call/lib/sounds'
import { resolveSound, type AppSoundSettings, type CustomSounds } from './choice'
import { isSoundEvent } from './events'

export interface AppSoundHandlerDeps {
  read: () => { settings: AppSoundSettings; custom: CustomSounds }
  /** API_BASE_URL (o áudio próprio vem do servidor). */
  apiBase: string
  playNotes: (notes: Note[], opts: { gain: number }) => void
  /** Resolve false quando não deu para tocar o arquivo. */
  playClip: (key: string, src: string, gain: number) => Promise<boolean>
  stopClip: (key: string) => void
}

/**
 * O handler do playSound (call/lib/sounds): troca os sons trocáveis pelo que
 * a pessoa escolheu. Os portões de antes (Não perturbe, silenciar servidor,
 * ensurdecido...) já decidiram que é para tocar; aqui só se escolhe o quê.
 */
export function createAppSoundHandler(deps: AppSoundHandlerDeps): SoundHandler {
  return {
    play: (name) => {
      if (!isSoundEvent(name)) return false
      const { settings, custom } = deps.read()
      const sound = resolveSound(name, settings, custom, deps.apiBase)
      if (sound.kind === 'notes') deps.playNotes(sound.notes, { gain: sound.gain })
      if (sound.kind === 'file') {
        void deps.playClip(name, sound.src, sound.gain).then((ok) => {
          if (!ok) deps.playNotes(sound.fallback, { gain: sound.gain })
        })
      }
      return true
    },
    stop: (name) => deps.stopClip(name)
  }
}
