import { ApiError } from '../../../shared/api/client'
import { errorMessage } from '../../../shared/lib/errorMessage'

/** O que a escolha de um resultado da busca usa de fora (API, store e aviso). */
export interface SearchPickDeps {
  pick: () => Promise<unknown>
  dismiss: () => void
  markExpired: () => void
  error: (message: string) => void
}

/** Escolhe o resultado; 410 = a busca expirou (opções cinzas), outro erro vira aviso. */
export async function runSearchPick(deps: SearchPickDeps): Promise<void> {
  try {
    await deps.pick()
    deps.dismiss()
  } catch (err) {
    if (err instanceof ApiError && err.status === 410) deps.markExpired()
    else deps.error(errorMessage(err, 'Falha na operação.'))
  }
}
