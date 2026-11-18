import { errorText } from '../../servers/lib/channelSidebar'

export interface JoinFriendCallDeps {
  join: (channelId: string) => Promise<void>
  navigate: (route: string) => void
  toastError: (msg: string) => void
}

/**
 * Entra no canal de voz em que o amigo está e abre a tela do canal. Sala
 * trancada, troca de canal e "já estou aqui" ficam com o `join`
 * (joinVoiceChannel); qualquer falha vira aviso e não navega. Nunca rejeita.
 */
export async function joinFriendCall(
  target: { serverId: string; channelId: string },
  deps: JoinFriendCallDeps
): Promise<void> {
  try {
    await deps.join(target.channelId)
  } catch (err) {
    deps.toastError(errorText(err, 'Falha ao conectar ao canal de voz.'))
    return
  }
  deps.navigate(`/servers/${target.serverId}/channels/${target.channelId}`)
}
