import { useEffect } from 'react'
import { onWsEvent } from '../../../shared/api/ws'
import type { Message } from '../../chat/api/messages'
import { useAuthStore } from '../../auth/store/authStore'
import { useActiveRoomStore } from '../../chat/store/activeRoomStore'
import { presentInApp } from '../lib/expoPush'
import { inAppNotificationFor } from '../lib/inAppNotification'
import { roleIdsOf, useMyRolesStore, type MemberRolesPayload } from '../../servers/store/myRolesStore'

/** Com o app aberto o servidor não manda push: este hook avisa de DM e de menção que chegam fora da conversa aberta. */
export function useInAppNotifications(): void {
  const signedIn = useAuthStore((s) => s.status === 'signedIn')

  useEffect(() => {
    if (!signedIn) return
    // Os meus cargos em cada servidor: é o que diz se uma menção de cargo é para mim.
    void useMyRolesStore.getState().load()
    return onWsEvent((event) => {
      const me = useAuthStore.getState().user
      if (!me) return
      if (event.type === 'server:member:roles') {
        useMyRolesStore.getState().applyMemberRoles(me.id, event.payload as MemberRolesPayload)
        return
      }
      if (event.type !== 'message:create') return
      const payload = event.payload as { message?: Message; server_id?: string }
      const myRoleIds = roleIdsOf(useMyRolesStore.getState(), me.id, payload.server_id)
      const n = inAppNotificationFor(payload, me, useActiveRoomStore.getState().active, myRoleIds)
      if (n) void presentInApp(n).catch(() => {})
    })
  }, [signedIn])
}
