import { useAuthStore } from '../../auth/store/authStore'
import { useCallStore } from '../../call/store/callStore'
import { useServerAccess } from '../../servers/hooks/useServerAccess'
import { Perm } from '../../servers/lib/permissions'
import { useServerStore } from '../../servers/store/serverStore'
import { showToast } from '../../../shared/store/toastStore'
import { liftCastigo } from '../api/castigos'
import type { DirectPowers } from '../lib/castigo'
import { CASTIGO_COPY, castigoErrorMessage } from '../lib/castigoCopy'
import { castigoMenu, type CastigoMenu } from '../lib/castigoMenu'
import { useCastigoDialogStore } from '../store/castigoDialogStore'
import { useCastigoStore } from '../store/castigoStore'

export interface CastigoMenuTarget {
  userId: string
  name: string
  /** A call do alvo neste servidor (serverCalls), se ele está em voz. */
  voiceCallId?: string
}

export interface CastigoMenuState extends CastigoMenu {
  open: () => void
  lift: () => Promise<void>
}

/** O castigo no menu de um usuário do servidor aberto. */
export function useCastigoMenu(target: CastigoMenuTarget): CastigoMenuState {
  const server = useServerStore((s) => s.currentServer)
  const isMember = useServerStore((s) => s.currentMembers.some((m) => m.user_id === target.userId))
  const meId = useAuthStore((s) => s.user?.id)
  const myCallId = useCallStore((s) =>
    s.status === 'active' && s.type === 'channel' ? s.callId : null
  )
  const castigo = useCastigoStore((s) =>
    server ? s.byServer[server.id]?.[target.userId] : undefined
  )
  const access = useServerAccess()

  const canAct = access.canActOnMember(target.userId)
  const powers: DirectPowers = {
    canMute: canAct && access.can(Perm.MUTE_MEMBERS),
    canDeafen: canAct && access.can(Perm.DEAFEN_MEMBERS),
    canDisconnect: canAct && access.can(Perm.DISCONNECT_MEMBERS)
  }
  const sharedCallId = myCallId && myCallId === target.voiceCallId ? myCallId : undefined
  const menu = castigoMenu({
    eligible: Boolean(
      server && isMember && target.userId !== meId && target.userId !== server.owner_id
    ),
    sharedCallId,
    powers,
    castigo,
    now: Date.now()
  })

  return {
    ...menu,
    open: () => {
      if (!server) return
      useCastigoDialogStore.getState().open({
        serverId: server.id,
        userId: target.userId,
        name: target.name,
        callId: sharedCallId,
        ...powers
      })
    },
    lift: async () => {
      if (!server) return
      try {
        await liftCastigo(server.id, target.userId)
        showToast.success(CASTIGO_COPY.lifted(target.name))
      } catch (err) {
        showToast.error(castigoErrorMessage(err, CASTIGO_COPY.liftFailed))
      }
    }
  }
}
