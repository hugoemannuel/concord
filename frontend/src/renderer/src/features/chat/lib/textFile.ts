import { fetchMediaFile } from '../api/mediaFile'

/** A prévia na conversa lê só o começo do arquivo. */
export const PREVIEW_BYTES = 16 * 1024
/** O visualizador carrega até 1 MB; o resto, só baixando. */
export const VIEWER_BYTES = 1024 * 1024
/** Linhas da prévia antes do "Mostrar mais". */
export const PREVIEW_LINES = 20

type FetchFile = (attachmentId: string, init?: RequestInit) => Promise<Response>

/**
 * Texto dos primeiros maxBytes. Uma runa cortada no fim some (stream), sem
 * caractere de erro; se o servidor ignorou o Range, corta aqui.
 */
export function decodeText(buffer: ArrayBuffer, maxBytes: number): string {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, maxBytes))
  return new TextDecoder('utf-8').decode(bytes, { stream: true })
}

/** Começo (maxBytes) de um arquivo de texto do chat. Falha → rejeita. */
export async function fetchTextHead(
  attachmentId: string,
  maxBytes: number,
  fetchFile: FetchFile = fetchMediaFile
): Promise<string> {
  const res = await fetchFile(attachmentId, { headers: { Range: `bytes=0-${maxBytes - 1}` } })
  if (!res.ok) throw new Error(`arquivo indisponível (${res.status})`)
  return decodeText(await res.arrayBuffer(), maxBytes)
}

/** As primeiras linhas da prévia e se há mais para o "Mostrar mais". */
export function previewLines(
  text: string,
  maxLines = PREVIEW_LINES
): { head: string; hasMore: boolean } {
  const lines = text.split('\n')
  if (lines.length <= maxLines) return { head: text, hasMore: false }
  return { head: lines.slice(0, maxLines).join('\n'), hasMore: true }
}

/** O visualizador mostra só o primeiro 1 MB (e a linha "…" no fim). */
export function viewerTruncated(sizeBytes: number): boolean {
  return sizeBytes > VIEWER_BYTES
}
