// Carga da lista de uma seção: "carregando" até a resposta, depois pronta ou
// com erro (e aí o "Tentar de novo" carrega outra vez).

export type LoadStatus = 'loading' | 'ready' | 'error'

/** Roda a carga e avisa o resultado; o retorno cancela o aviso (efeito do React). */
export function startLoad(
  load: () => Promise<boolean>,
  onStatus: (status: LoadStatus) => void
): () => void {
  let active = true
  const report = (status: LoadStatus): void => {
    if (active) onStatus(status)
  }
  load().then(
    (ok) => report(ok ? 'ready' : 'error'),
    () => report('error')
  )
  return () => {
    active = false
  }
}
