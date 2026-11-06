/** Qualquer função (os argumentos de cada uma são checados em `T`). */
export type AnyHandler = (...args: never[]) => unknown

/** Objeto só de funções (interface também serve, sem index signature). */
export type HandlerMap<T> = { [K in keyof T]: AnyHandler }

/**
 * Objeto com as funções `keys`, mas fixo: cada uma chama a versão que `latest()`
 * devolve na hora da chamada. Componente memoizado recebe sempre a mesma
 * referência e o handler ainda vê o estado atual.
 */
function forwardingHandlers<T extends HandlerMap<T>>(
  keys: (keyof T & string)[],
  latest: () => T
): T {
  const handlers = {} as Record<string, AnyHandler>
  for (const key of keys) {
    handlers[key] = (...args: never[]) => (latest()[key] as AnyHandler)(...args)
  }
  return handlers as T
}

/**
 * Caixa dos handlers: `handlers` é sempre o mesmo objeto e `update` troca a
 * versão que eles chamam (useStableHandlers chama a cada render, num efeito).
 */
export function handlerBox<T extends HandlerMap<T>>(
  initial: T
): { handlers: T; update: (next: T) => void } {
  let latest = initial
  return {
    handlers: forwardingHandlers(Object.keys(initial) as (keyof T & string)[], () => latest),
    update: (next) => {
      latest = next
    }
  }
}
