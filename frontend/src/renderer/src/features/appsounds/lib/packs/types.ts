import type { Note } from '../../../call/lib/sounds'
import type { SoundEvent } from '../events'

export interface SoundPack {
  id: string
  label: string
  /** Uma linha para a pessoa saber o clima antes de ouvir. */
  description: string
  sounds: Record<SoundEvent, Note[]>
}
