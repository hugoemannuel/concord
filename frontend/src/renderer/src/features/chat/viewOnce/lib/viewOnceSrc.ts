import { API_BASE_URL } from '../../../../shared/lib/config'
import { mediaFileUrl } from '../../lib/attachments'

/** URL do arquivo de visualização única: a rota de mídia comum com o token da abertura. */
export function viewOnceSrc(attachmentId: string, token: string): string {
  return mediaFileUrl(API_BASE_URL, attachmentId, token)
}
