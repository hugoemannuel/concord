import { onWsEvent } from '../../../shared/api/ws'
import { showToast } from '../../../shared/store/toastStore'
import { endLocalSession } from '../../profile/store/meActions'

/**
 * O servidor fechou o WebSocket com 4001 (sessão encerrada em outro
 * dispositivo, senha redefinida ou conta excluída): o token não vale mais,
 * então limpa a sessão local e volta ao login (docs/adr/0039).
 */
export function startSessionRevoked(): () => void {
  return onWsEvent((event) => {
    if (event.type !== 'session:revoked') return
    showToast.info('Sua sessão foi encerrada. Entre de novo.')
    void endLocalSession()
  })
}
