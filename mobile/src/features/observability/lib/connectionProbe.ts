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

/** Sem endereços (o do LiveKit leva o token na URL) e curto. */
function reasonOf(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/\b\w+:\/\/\S+/g, '…').slice(0, MAX_REASON)
}

function accessFailure(err: unknown): string | null {
  if (!(err instanceof ApiError)) return reasonOf(err)
  if (err.status === 0) return reasonOf(err)
  return err.status >= 500 ? `HTTP ${err.status}` : null
}

export function createConnectionProbe(log: CallEventLog, phase: () => CallPhase) {
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
      media.onConnection((state) => {
        const now = phase()
        if (state === 'disconnected' && (now === 'active' || now === 'reconnecting')) {
          failed(now === 'active' ? 'conectada' : 'reconectando', 'caiu')
        }
      })
      return { ...media, connect: watched(media.connect.bind(media), (err) => failed('entrando (voz)', reasonOf(err))) }
    }
  }
}

export type ConnectionProbe = ReturnType<typeof createConnectionProbe>
