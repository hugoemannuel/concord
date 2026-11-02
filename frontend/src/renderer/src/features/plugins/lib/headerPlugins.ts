import type { ServerPlugin } from '../api/plugins'

/** A partir de quantos plugins ligados o cabeçalho junta tudo num só botão. */
export const GROUP_AT = 3

/** Só os plugins que a pessoa ligou, na ordem recebida. */
export function headerPlugins(list: ServerPlugin[]): ServerPlugin[] {
  return list.filter((p) => p.enabled)
}

export function shouldGroup(count: number): boolean {
  return count >= GROUP_AT
}
