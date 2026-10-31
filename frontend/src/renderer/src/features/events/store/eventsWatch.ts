import { onWsEvent } from '../../../shared/api/ws'
import { useAuthStore } from '../../auth/store/authStore'
import { resetEventAccessStore, useEventAccessStore } from './eventAccessStore'
import { resetEventsStore, useEventsStore } from './eventsStore'

// Liga o store dos eventos ao ws (event:*) uma vez por sessão do app e zera
// tudo ao trocar de conta (a minha resposta é da conta).

let started = false

export function startEventsWatch(): void {
  if (started) return
  started = true
  onWsEvent((event) => {
    useEventsStore.getState().handleWsEvent(event)
    useEventAccessStore.getState().handleWsEvent(event)
  })
  useAuthStore.subscribe((state, prev) => {
    if (state.user?.id === prev.user?.id) return
    resetEventsStore()
    resetEventAccessStore()
  })
}
