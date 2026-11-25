/**
 * Liga a coleta quando passa a valer (login de conta) e desliga quando deixa
 * (logout, visita sem conta). Cada ligada é uma sessão nova.
 */
export function createSessionSwitch(start: () => () => void): (on: boolean) => void {
  let stop: (() => void) | null = null
  return (on) => {
    if (on === (stop !== null)) return
    if (on) {
      stop = start()
    } else {
      stop?.()
      stop = null
    }
  }
}
