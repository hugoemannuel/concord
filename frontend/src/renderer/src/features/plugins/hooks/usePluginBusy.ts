import { useRef, useState } from 'react'
import { runExclusive } from '../lib/pluginSettingsActions'

/** Ids com pedido em andamento, e `exclusive` para rodar uma ação sem repetir. */
export interface PluginBusy {
  ids: ReadonlySet<string>
  exclusive: (id: string, fn: () => Promise<void>) => Promise<void>
}

export function usePluginBusy(): PluginBusy {
  const held = useRef(new Set<string>())
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set())
  const exclusive = (id: string, fn: () => Promise<void>): Promise<void> =>
    runExclusive(held.current, id, setIds, fn)
  return { ids, exclusive }
}
