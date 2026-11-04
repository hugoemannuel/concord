// Ordem dos canais na barra lateral (dentro da seção de texto ou de voz). Puro,
// sem React.

type ChannelKind = 'text' | 'voice'

/** Move o item do índice `from` para `to` (nova lista; índices limitados). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (from < 0 || from >= next.length) return next
  const target = Math.max(0, Math.min(next.length - 1, to))
  const [item] = next.splice(from, 1)
  next.splice(target, 0, item)
  return next
}

/** Índice de inserção → índice final do item arrastado (para moveItem). */
export function insertionToTarget(from: number, insertion: number): number {
  return insertion > from ? insertion - 1 : insertion
}

/**
 * Aplica a ordem `ids` aos canais do tipo `type`, nos mesmos lugares da lista
 * em que eles já estavam (os do outro tipo não mudam). Canal que não está em
 * `ids` (acabou de ser criado) vai para o fim da seção. Sem mudança, devolve a
 * mesma lista.
 */
export function applyChannelOrder<C extends { id: string; type?: string }>(
  channels: C[],
  type: ChannelKind,
  ids: readonly string[]
): C[] {
  const isType = (c: C): boolean => (c.type ?? 'text') === type
  const rank = new Map(ids.map((id, i) => [id, i]))
  const section = channels.filter(isType)
  const sorted = section
    .map((c, i) => ({ c, key: rank.get(c.id) ?? ids.length + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.c)
  if (sorted.every((c, i) => c === section[i])) return channels
  let next = 0
  return channels.map((c) => (isType(c) ? sorted[next++] : c))
}
