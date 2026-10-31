import { uploadEventBanner } from '../api/events'
import { bannerFileError } from './bannerFile'
import { eventErrorMessage } from './eventErrors'

export type BannerPick = { ok: true; bannerId: string } | { ok: false; error: string }

/**
 * Confere o arquivo e o envia como banner. Devolve o id do arquivo no servidor
 * ou o texto do problema (arquivo que não serve, recusa do servidor, rede).
 */
export async function uploadBanner(
  serverId: string,
  file: File,
  send: (serverId: string, file: Blob) => Promise<string> = uploadEventBanner
): Promise<BannerPick> {
  const problem = bannerFileError(file)
  if (problem) return { ok: false, error: problem }
  try {
    return { ok: true, bannerId: await send(serverId, file) }
  } catch (err) {
    return { ok: false, error: eventErrorMessage(err) }
  }
}
