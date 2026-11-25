import { ApiError } from '../../../shared/api/client'
import type { CallMedia } from '../../call/lib/callMedia'
import type { CallPhase } from '../../call/lib/callTypes'
import type { CallEventLog } from './callEventLog'

// Sonda da conexão da voz (docs/adr/0070): decora, na montagem da chamada (callRuntime), a API e a mídia para
// anotar em que etapa a entrada falhou e quando a voz caiu, sem mexer no callController. "acesso" = o nosso
// servidor (só rede ou erro 5xx: sala trancada e sem permissão são recusas, não falhas); "voz" = o LiveKit.

const MAX_REASON = 80

interface CallApi {
  startCall: (...args: never[]) => Promise<unknown>
  getCallToken: (...args: never[]) => Promise<unknown>
}

/** Sem endereços (o do LiveKit leva o token na URL) nem IP, e curto. */
function reasonOf(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message
    .replace(/\b\w+:\/\/\S+/g, '…')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}(:\d+)?/g, '…')
    .slice(0, MAX_REASON)
}

function accessFailure(err: unknown): string | null {
  if (!(err instanceof ApiError)) return reasonOf(err)
  if (err.status === 0) return reasonOf(err)
  return err.status >= 500 ? `HTTP ${err.status}` : null
}

export interface ProbeSession {
  phase: CallPhase
  callId: string | null
}

export function createConnectionProbe(log: CallEventLog, session: () => ProbeSession) {
  const failed = (where: string, reason: string): void => log.add('conexao_falhou', `${where}: ${reason}`)

  function watched<A extends unknown[], R>(call: (...args: A) => Promise<R>, onError: (err: unknown) => void) {
    return async (...args: A): Promise<R> => {
      try {
        return await call(...args)
      } catch (err) {
        onError(err)
        throw err
      }
    }
  }

  const onAccessError = (err: unknown): void => {
    const reason = accessFailure(err)
    if (reason) failed('entrando (acesso)', reason)
  }

  return {
    api<T extends CallApi>(api: T): T {
      return { ...api, startCall: watched(api.startCall, onAccessError), getCallToken: watched(api.getCallToken, onAccessError) }
    },
    media(media: CallMedia): CallMedia {
      media.onConnection((state, info) => {
        const { phase } = session()
        // Tirado pelo servidor (desconectado, castigo, canal fechado) ou a sala acabou: não é queda.
        if (state !== 'disconnected' || info?.expected) return
        if (phase === 'active' || phase === 'reconnecting') failed(phase === 'active' ? 'conectada' : 'reconectando', 'caiu')
      })
      const connect = async (url: string, token: string): Promise<void> => {
        const before = session().callId
        try {
          await media.connect(url, token)
        } catch (err) {
          // Cancelou ou trocou de canal no meio da entrada (o disconnect rejeita o connect): não é falha.
          const now = session()
          if (now.phase === 'connecting' && now.callId === before) failed('entrando (voz)', reasonOf(err))
          throw err
        }
      }
      return { ...media, connect }
    }
  }
}

export type ConnectionProbe = ReturnType<typeof createConnectionProbe>
