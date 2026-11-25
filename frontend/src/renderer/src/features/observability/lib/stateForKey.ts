/**
 * O estado guardado só vale para o pedido que o gerou (`key`: período e
 * tentativa). Trocou o período e o pedido novo ainda não voltou: `loading`, em
 * vez de mostrar por um instante os dados do período anterior.
 */
export function stateForKey<K, S>(entry: { key: K; state: S } | null, key: K, loading: S): S {
  return entry !== null && entry.key === key ? entry.state : loading
}
