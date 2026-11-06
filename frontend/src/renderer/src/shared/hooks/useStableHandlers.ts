import { useLayoutEffect, useState } from 'react'
import { handlerBox, type HandlerMap } from '../lib/stableHandlers'

/**
 * Handlers com referência fixa que sempre rodam a versão do último render (como
 * o useEffectEvent, mas para passar a filhos memoizados). Só para eventos: não
 * chame durante o render. As chaves são as do primeiro render.
 */
export function useStableHandlers<T extends HandlerMap<T>>(impl: T): T {
  const [box] = useState(() => handlerBox(impl))
  useLayoutEffect(() => {
    box.update(impl)
  })
  return box.handlers
}
