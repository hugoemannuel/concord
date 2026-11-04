import { useServerStore } from '../../servers/store/serverStore'
import { useServerAccess } from '../../servers/hooks/useServerAccess'
import { Perm } from '../../servers/lib/permissions'
import { externalAllowed } from '../lib/pickerSections'

/** Para onde vai o que a pessoa escolher no seletor; vazio = DM ou grupo. */
export interface PickerDestination {
  serverId?: string | null
  channelId?: string | null
}

/** A pessoa pode usar emojis e figurinhas de outros servidores neste destino? */
export function useExternalAccess({ serverId, channelId }: PickerDestination): boolean {
  const openServerId = useServerStore((s) => s.currentServer?.id)
  const rolesLoaded = useServerStore((s) => (s.roles?.length ?? 0) > 0)
  const access = useServerAccess()
  return externalAllowed({
    serverId,
    channelId,
    openServerId,
    rolesLoaded,
    can: () => access.can(Perm.USE_EXTERNAL_EMOJIS),
    canInChannel: (id) => access.canInChannel(id, Perm.USE_EXTERNAL_EMOJIS)
  })
}
