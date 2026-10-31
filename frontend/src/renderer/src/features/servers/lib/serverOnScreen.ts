import type { Server } from '../api/servers'

const SERVER_PATH = /^\/servers\/([^/]+)/

/**
 * Servidor que o usuário está olhando agora: só quando a rota é a de um
 * servidor e o store já tem esse mesmo servidor carregado. Fora de um servidor
 * (início, DMs, melhorias…) não há nenhum, mesmo que o store guarde o último.
 */
export function serverOnScreen(pathname: string, current: Server | null): Server | null {
  const id = SERVER_PATH.exec(pathname)?.[1]
  return id && current?.id === id ? current : null
}
