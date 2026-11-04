import { getServer, type Server, type ServerMember } from '../api/servers'
import { listChannels } from '../api/channels'
import { serverAccess, type ServerAccess } from './serverAccess'
import { sortRoles } from './roleList'

/** O que o menu do ícone precisa de um servidor que talvez não esteja aberto. */
export interface ServerMenuData {
  server: Server
  members: ServerMember[]
  access: ServerAccess
}

/**
 * Lê servidor, membros, cargos e canais de `serverId` e calcula o que a pessoa
 * pode nele, sem mexer na tela aberta (nada vai para o serverStore). É o mesmo
 * cálculo do servidor aberto: `serverAccess`.
 */
export async function loadServerMenuData(
  serverId: string,
  meId: string | undefined
): Promise<ServerMenuData> {
  const [res, channels] = await Promise.all([getServer(serverId), listChannels(serverId)])
  const members = res.members ?? []
  const access = serverAccess({
    ownerId: res.server.owner_id,
    meId,
    members,
    roles: sortRoles(res.roles ?? []),
    channels: Array.isArray(channels) ? channels : []
  })
  return { server: res.server, members, access }
}

/**
 * Menu do servidor enquanto a leitura não chega (ou se ela falhar): sem
 * membros, a pessoa não tem permissão nenhuma, então só entra o que vale para
 * qualquer membro. O servidor confere de novo a cada ação.
 */
export function fallbackMenuData(server: Server, meId: string | undefined): ServerMenuData {
  const access = serverAccess({
    ownerId: server.owner_id,
    meId,
    members: [],
    roles: [],
    channels: []
  })
  return { server, members: [], access }
}
