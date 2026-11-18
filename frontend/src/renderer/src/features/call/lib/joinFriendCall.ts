import { errorText } from '../../servers/lib/channelSidebar'

export interface JoinFriendCallDeps {
  join: (channelId: string) => Promise<void>
  navigate: (route: string) => void
  toastError: (msg: string) => void
  /** Em call de DM/grupo: não troca por um canal (fica como hoje). */
  inDmCall: () => boolean
  /** Depois do join: entrou no canal ou está batendo na porta dele. */
  landed: (channelId: string) => boolean
}

/**
 * Entra no canal de voz em que o amigo está e abre a tela do canal. Sala
 * trancada, troca de canal e "já estou aqui" ficam com o `join`
 * (joinVoiceChannel). Ele avisa sozinho de quase toda falha (sem permissão,
 * rede, microfone) sem lançar: por isso só navega se de fato entrou ou bateu
 * na porta. O que ele lança vira aviso. Nunca rejeita.
 */
export async function joinFriendCall(
  target: { serverId: string; channelId: string },
  deps: JoinFriendCallDeps
): Promise<void> {
  if (deps.inDmCall()) {
    deps.toastError('Você já está em uma chamada.')
    return
  }
  try {
    await deps.join(target.channelId)
  } catch (err) {
    deps.toastError(errorText(err, 'Falha ao conectar ao canal de voz.'))
    return
  }
  if (deps.landed(target.channelId)) {
    deps.navigate(`/servers/${target.serverId}/channels/${target.channelId}`)
  }
}
