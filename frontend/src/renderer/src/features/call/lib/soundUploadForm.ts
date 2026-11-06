import { errorMessage } from '../../../shared/lib/errorMessage'
import type { UploadSoundboardInput } from '../api/soundboard'

/** O que o formulário "Adicionar som" tem na hora de salvar. */
export interface SoundSubmitForm {
  file: File | null
  durationMs: number | null
  name: string
  emoji: string
  submitting: boolean
}

/** O que o formulário faz com o resultado do envio. */
export interface SoundSubmitUi {
  setSubmitting: (submitting: boolean) => void
  setError: (message: string | null) => void
  success: (message: string) => void
  /** Enviou: fecha o modal. */
  done: () => void
}

export type UploadSound = (file: File, input: UploadSoundboardInput) => Promise<unknown>

/** Salva o som na mesa: confere o nome, envia e avisa (ou mostra o erro no formulário). */
export async function submitSound(
  form: SoundSubmitForm,
  upload: UploadSound,
  ui: SoundSubmitUi
): Promise<void> {
  const { file, durationMs } = form
  if (!file || !durationMs || form.submitting) return
  const trimmedName = form.name.trim()
  if (!trimmedName) {
    ui.setError('Digite um nome para o som.')
    return
  }

  ui.setSubmitting(true)
  ui.setError(null)
  try {
    await upload(file, {
      name: trimmedName,
      emoji: form.emoji.trim() || undefined,
      duration_ms: durationMs,
      filename: file.name
    })
    ui.success('Som adicionado à mesa de áudio!')
    ui.done()
  } catch (err) {
    ui.setError(errorMessage(err, 'Não foi possível enviar o áudio.'))
  } finally {
    ui.setSubmitting(false)
  }
}

/** Botão de prévia: para (voltando ao início) ou toca do começo. */
export function toggleSoundPreview(
  el: HTMLAudioElement | null,
  previewUrl: string | null,
  playing: boolean,
  setPlaying: (playing: boolean) => void
): void {
  if (!el || !previewUrl) return
  if (playing) {
    el.pause()
    el.currentTime = 0
    setPlaying(false)
    return
  }
  el.currentTime = 0
  void el
    .play()
    .then(() => setPlaying(true))
    .catch(() => setPlaying(false))
}
