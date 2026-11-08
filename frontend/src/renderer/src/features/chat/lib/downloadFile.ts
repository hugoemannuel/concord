import { fetchMediaFile } from '../api/mediaFile'
import type { Attachment } from '../api/messages'

/** Quanto o blob: fica vivo depois do clique (o download já começou). */
const REVOKE_AFTER_MS = 60_000

/**
 * Salva o blob com o nome dado por um <a download> temporário. Com blob: o
 * download funciona no navegador e no Electron (em outra origem o atributo
 * download de um link direto é ignorado e vira navegação com o token).
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}

interface DownloadDeps {
  fetchFile: (attachmentId: string) => Promise<Response>
  save: (blob: Blob, filename: string) => void
}

/** Baixa o arquivo do anexo pelo app (até 25 MB em memória) e salva com o nome original. */
export async function downloadAttachment(
  attachment: Pick<Attachment, 'id' | 'filename'>,
  deps: DownloadDeps = { fetchFile: (id) => fetchMediaFile(id), save: saveBlob }
): Promise<void> {
  const res = await deps.fetchFile(attachment.id)
  if (!res.ok) throw new Error(`arquivo indisponível (${res.status})`)
  deps.save(await res.blob(), attachment.filename)
}
