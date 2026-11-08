import { API_BASE_URL } from '../../../shared/lib/config'
import { mediaFileUrl } from '../lib/attachments'
import { ensureMediaToken, invalidateMediaToken } from '../store/mediaToken'

export interface MediaFileDeps {
  baseUrl: string
  token: () => Promise<string>
  invalidate: (usedToken: string) => void
  fetch: (url: string, init: RequestInit) => Promise<Response>
}

const DEFAULT_DEPS: MediaFileDeps = {
  baseUrl: API_BASE_URL,
  token: () => ensureMediaToken(),
  invalidate: invalidateMediaToken,
  fetch: (url, init) => fetch(url, init)
}

async function fetchWithToken(
  attachmentId: string,
  init: RequestInit,
  deps: MediaFileDeps
): Promise<{ res: Response; token: string }> {
  const token = await deps.token()
  const res = await deps.fetch(mediaFileUrl(deps.baseUrl, attachmentId, token), init)
  return { res, token }
}

/**
 * Busca o arquivo de um anexo com o token de mídia (dentro do app: o token
 * não sai para o navegador de fora). Token vencido (401): pede outro e tenta
 * uma vez.
 */
export async function fetchMediaFile(
  attachmentId: string,
  init: RequestInit = {},
  deps: MediaFileDeps = DEFAULT_DEPS
): Promise<Response> {
  const first = await fetchWithToken(attachmentId, init, deps)
  if (first.res.status !== 401) return first.res
  deps.invalidate(first.token)
  return (await fetchWithToken(attachmentId, init, deps)).res
}
