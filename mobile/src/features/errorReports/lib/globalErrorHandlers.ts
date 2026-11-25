// Captura global do app (ADR 0068): erro de JS sem dono (ErrorUtils) e promessa
// rejeitada sem tratamento (rastreador do Hermes).

export type GlobalHandler = (error: unknown, isFatal?: boolean) => void

export interface ErrorUtilsLike {
  getGlobalHandler: () => GlobalHandler
  setGlobalHandler: (handler: GlobalHandler) => void
}

export interface GlobalHandlerDeps {
  record: (error: unknown) => void
  /** Tenta mandar a fila já (o app morre logo depois de um fatal); resolve ou rejeita, tanto faz. */
  flushFatal: () => Promise<void>
}

/**
 * Encadeia no handler global do RN: registra e sempre chama o anterior, com o mesmo
 * isFatal (é ele que mostra a RedBox no dev e fecha o app no release). No fatal, o
 * anterior espera a tentativa de envio (o `flushFatal` tem teto de tempo); se o envio
 * não sair antes de o processo morrer, o erro se perde.
 */
export function installGlobalHandler(errorUtils: ErrorUtilsLike | undefined, deps: GlobalHandlerDeps): boolean {
  if (!errorUtils) return false
  const previous = errorUtils.getGlobalHandler()
  errorUtils.setGlobalHandler((error, isFatal) => {
    try {
      deps.record(error)
    } catch {
      // Segue para o anterior de qualquer jeito.
    }
    if (!isFatal) return previous(error, isFatal)
    void deps
      .flushFatal()
      .catch(() => undefined)
      .finally(() => previous(error, isFatal))
  })
  return true
}

export interface RejectionTrackerOptions {
  allRejections: boolean
  onUnhandled: (id: number, rejection: unknown) => void
  onHandled: (id: number) => void
}

export interface RejectionTrackerHost {
  enablePromiseRejectionTracker?: (options: RejectionTrackerOptions) => void
}

/**
 * Promessas rejeitadas sem tratamento, pelo `HermesInternal.enablePromiseRejectionTracker`
 * (o mesmo `promise/setimmediate/rejection-tracking` que o RN usa por baixo).
 * O RN 0.88 (Libraries/Core/polyfillPromise.js) só liga esse rastreador no __DEV__,
 * para o aviso "Uncaught (in promise)" do LogBox; em release ninguém escuta. O Hermes
 * guarda um rastreador só, então ligar o nosso no dev apagaria o do RN: aqui ele liga
 * só fora do __DEV__ (no dev, rejeição sem tratamento não vai ao relatório).
 */
export function installRejectionTracker(
  hermes: RejectionTrackerHost | null | undefined,
  record: (error: unknown) => void,
  isDev: boolean
): boolean {
  if (isDev || !hermes?.enablePromiseRejectionTracker) return false
  hermes.enablePromiseRejectionTracker({
    allRejections: true,
    onUnhandled: (_id, rejection) => record(rejection),
    // Tratada depois do aviso: o relatório já foi; nada a desfazer.
    onHandled: () => undefined
  })
  return true
}
