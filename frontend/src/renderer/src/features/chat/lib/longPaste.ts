import { MAX_ATTACHMENTS_PER_MESSAGE } from './attachments'

/** Limite do campo de mensagem: colar mais que isso vira anexo (como no Discord). */
export const MAX_PASTE_CHARS = 2000

/**
 * Texto colado com mais de MAX_PASTE_CHARS caracteres vira o anexo
 * message.txt. draftCount = anexos já no rascunho; null = sem permissão de
 * anexar. Rascunho cheio ou sem permissão: null (cola normal).
 */
export function longPasteFile(text: string, draftCount: number | null): File | null {
  if (draftCount === null || draftCount >= MAX_ATTACHMENTS_PER_MESSAGE) return null
  if (text.length <= MAX_PASTE_CHARS) return null
  return new File([text], 'message.txt', { type: 'text/plain' })
}

/** O que um colar manda para o rascunho: o texto longo, senão os arquivos (ex.: print). */
export function pastedFiles(
  clipboard: Pick<DataTransfer, 'getData'> & { files: ArrayLike<File> },
  draftCount: number | null
): File[] {
  const longText = longPasteFile(clipboard.getData('text/plain'), draftCount)
  return longText ? [longText] : Array.from(clipboard.files)
}
