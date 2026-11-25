// Tempo de abertura: do início do processo (desktop) ou da navegação (web)
// até a lista de servidores chegar. Só de quem abriu o app já logado: quem
// passou pelo login mediria o tempo de digitar a senha.

interface StartupInput {
  startedLoggedIn: boolean
  web: boolean
  /** performance.now() quando a lista chegou. */
  now: number
  /** Desktop: window.api.deviceStats.usable (o main marca pelo process.uptime). */
  usable?: () => void
}

/** O startup_ms do web; no desktop devolve null e quem guarda é o main. */
export function markStartup(input: StartupInput): number | null {
  if (!input.startedLoggedIn) return null
  if (input.web) return Math.round(input.now)
  input.usable?.()
  return null
}
