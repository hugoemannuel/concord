import { errorMessage } from '../../../shared/lib/errorMessage'
import { MAX_STICKER_BYTES, MAX_STICKER_NAME_LEN } from '../api/stickers'

const STICKER_TYPES = new Set(['image/png', 'image/webp', 'image/gif'])

export interface PickedSticker {
  error: string | null
  file: File | null
  /** Nome sugerido (mantém o que a pessoa já digitou). */
  name: string
}

/** Imagem escolhida em "Nova figurinha": aceita ou explica por que não; sem arquivo, null (nada muda). */
export function pickStickerFile(selected: File | undefined, currentName: string): PickedSticker | null {
  if (!selected) return null
  if (selected.size > MAX_STICKER_BYTES) {
    return { error: 'A imagem deve ter no máximo 1 MB.', file: null, name: currentName }
  }
  if (!STICKER_TYPES.has(selected.type)) {
    return { error: 'Apenas imagens PNG, WebP ou GIF são suportadas.', file: null, name: currentName }
  }
  const suggested = selected.name.replace(/\.[^/.]+$/, '').slice(0, MAX_STICKER_NAME_LEN)
  return { error: null, file: selected, name: currentName || suggested }
}

/** O que o formulário "Nova figurinha" faz com o resultado do envio. */
export interface StickerSubmitUi {
  setSubmitting: (submitting: boolean) => void
  setError: (message: string | null) => void
  success: (message: string) => void
  /** Enviou: limpa e fecha o modal. */
  done: () => void
}

/** Por que a figurinha ainda não pode ser enviada (null: pode). */
function stickerFormError(file: File | null, trimmedName: string): string | null {
  if (!file) return 'Selecione uma imagem para a figurinha.'
  if (!trimmedName) return 'Dê um nome para a figurinha.'
  if (trimmedName.length > MAX_STICKER_NAME_LEN) {
    return `O nome pode ter no máximo ${MAX_STICKER_NAME_LEN} caracteres.`
  }
  return null
}

/** Envia a figurinha: confere imagem e nome, envia e avisa (ou mostra o erro no formulário). */
export async function submitSticker(
  file: File | null,
  name: string,
  upload: (name: string, file: File, filename: string) => Promise<unknown>,
  ui: StickerSubmitUi
): Promise<void> {
  const trimmedName = name.trim()
  const invalid = stickerFormError(file, trimmedName)
  if (invalid || !file) {
    ui.setError(invalid)
    return
  }

  ui.setSubmitting(true)
  ui.setError(null)
  try {
    await upload(trimmedName, file, file.name)
    ui.success('Figurinha adicionada com sucesso!')
    ui.done()
  } catch (err) {
    ui.setError(errorMessage(err, 'Não foi possível enviar a figurinha.'))
  } finally {
    ui.setSubmitting(false)
  }
}
