import { MAX_BANNER_BYTES } from '../api/events'

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']

/** Por que o arquivo não serve de banner (null = serve). O servidor confere de novo pelos bytes. */
export function bannerFileError(file: { type: string; size: number }): string | null {
  if (!ACCEPTED.includes(file.type)) return 'Use uma imagem PNG, JPEG ou WEBP.'
  if (file.size === 0) return 'A imagem está vazia.'
  if (file.size > MAX_BANNER_BYTES) return 'A imagem pode ter até 10 MB.'
  return null
}
