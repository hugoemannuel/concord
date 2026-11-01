// Imagem de fundo escolhida no editor: confere o arquivo e reduz para o
// tamanho de uma tela grande antes de enviar (leve para baixar a cada
// aparelho). O servidor aceita até 10 MB. Ver docs/adr/0043-aparencia-v3.md.

import { fitWithin } from '../../call/lib/backgroundImage'

export const THEME_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp'
/** Teto do arquivo escolhido, antes de reduzir. */
export const THEME_IMAGE_MAX_FILE = 20 * 1024 * 1024
/** Maior lado da imagem guardada (uma tela 1440p). */
export const THEME_IMAGE_MAX_W = 2560
export const THEME_IMAGE_MAX_H = 1440

/** O motivo de recusar o arquivo; null = serve. */
export function imageFileProblem(file: { type: string; size: number }): string | null {
  if (!THEME_IMAGE_ACCEPT.split(',').includes(file.type)) return 'Escolha uma imagem PNG, JPEG ou WEBP.'
  if (file.size > THEME_IMAGE_MAX_FILE) return 'A imagem é grande demais (máx. 20 MB).'
  return null
}

/** Reduz para caber em 2560×1440 (sem ampliar) e devolve um JPEG. */
export async function shrinkImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, THEME_IMAGE_MAX_W, THEME_IMAGE_MAX_H)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não foi possível ler a imagem.')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível ler a imagem.'))), 'image/jpeg', 0.86)
    )
  } finally {
    bitmap.close()
  }
}
