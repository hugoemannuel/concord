// Textos do card de "Ativo agora" (amigo em canal de voz de servidor).

const NO_SERVER = 'Servidor'
const NO_CHANNEL = 'Canal de voz'

function orDefault(name: string | null | undefined, fallback: string): string {
  return name?.trim() || fallback
}

/** "Os Brabos · Geral"; sem nome ainda, "Servidor" / "Canal de voz". */
export function voiceCardLine(
  serverName: string | null | undefined,
  channelName: string | null | undefined
): string {
  return `${orDefault(serverName, NO_SERVER)} · ${orDefault(channelName, NO_CHANNEL)}`
}

/** "4 na call". */
export function inCallCount(n: number): string {
  return `${n} na call`
}

/** Rótulo do card para leitor de tela. */
export function joinFriendCallLabel(friendName: string, channelName: string | null | undefined): string {
  return `Entrar na call de ${friendName} em ${orDefault(channelName, NO_CHANNEL)}`
}
