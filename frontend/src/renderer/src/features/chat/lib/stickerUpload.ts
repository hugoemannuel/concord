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
