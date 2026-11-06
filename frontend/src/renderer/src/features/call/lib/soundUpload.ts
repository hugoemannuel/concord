import { readMediaMeta } from '../../chat/lib/readMediaMeta'
import {
  MAX_SOUNDBOARD_BYTES,
  MAX_SOUNDBOARD_DURATION_MS,
  MAX_SOUNDBOARD_NAME_LEN,
  MIN_SOUNDBOARD_DURATION_MS
} from '../api/soundboard'

/** O que o formulário de "Adicionar som" faz com o resultado. */
export interface SoundPickUi {
  setError: (message: string | null) => void
  accept: (file: File, durationMs: number) => void
  /** Só quando a pessoa ainda não digitou um nome. */
  suggestName: (name: string) => void
}

/** Confere o áudio escolhido (tamanho, depois a duração) e entrega ao formulário. */
export async function selectSoundFile(
  selected: File | undefined,
  currentName: string,
  ui: SoundPickUi,
  readMeta: (file: File) => Promise<{ duration_ms?: number }> = (file) => readMediaMeta(file, 'audio')
): Promise<void> {
  if (!selected) return
  ui.setError(null)
  if (selected.size > MAX_SOUNDBOARD_BYTES) {
    ui.setError('O arquivo excede o limite de 5 MB.')
    return
  }
  const duration = (await readMeta(selected)).duration_ms ?? 0
  if (!duration || duration < MIN_SOUNDBOARD_DURATION_MS || duration > MAX_SOUNDBOARD_DURATION_MS) {
    ui.setError('O áudio precisa ser válido e ter entre 0,1s e 15s de duração.')
    return
  }
  ui.accept(selected, duration)
  if (!currentName.trim()) {
    ui.suggestName(selected.name.replace(/\.[^.]+$/, '').slice(0, MAX_SOUNDBOARD_NAME_LEN))
  }
}
