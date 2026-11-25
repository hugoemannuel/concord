import { IS_WEB } from '../../../shared/lib/config'
import { setErrorSink } from '../../../shared/lib/errorSink'
import { useAuthStore } from '../../auth/store/authStore'
import { useCallStore } from '../../call/store/callStore'
import { anonymousGuestLink, useGuestSessionStore } from '../../guests/store/guestSessionStore'
import { loadClientContext } from '../../observability/lib/telemetryContext'
import { postErrors, type ErrorReportContext } from '../api/errorReports'
import { createErrorReports } from './errorReports'
import { currentRoute } from './routePattern'

// Liga o relatório de erros do app (docs/adr/0068) uma vez, no main.tsx. Só
// lê o callStore; visitante sem conta e quem não logou não mandam (guardam).

function canSend(): boolean {
  const guest = anonymousGuestLink(useGuestSessionStore.getState()) !== null
  return !!useAuthStore.getState().accessToken && !guest
}

/** Só o que o contrato pede: sistema, versão e onde roda (sem placa nem rede). */
async function context(): Promise<ErrorReportContext> {
  const { os, app_version, target } = await loadClientContext()
  return { os, app_version, target: target === 'web' ? 'web' : 'desktop' }
}

let started = false

export function startErrorReports(): void {
  if (started) return
  started = true
  createErrorReports({
    events: window,
    setSink: setErrorSink,
    // Desktop usa o hash router (file://); a web, caminhos de verdade.
    screen: () => currentRoute(window.location, !IS_WEB),
    inCall: () => useCallStore.getState().status === 'active',
    inLive: () => {
      const call = useCallStore.getState()
      return call.isScreenSharing || call.watchedScreenIds.length > 0
    },
    canSend,
    context,
    send: postErrors,
    takeMain: window.api?.errorReport?.take,
    every: (run, ms) => {
      const timer = setInterval(run, ms)
      return () => clearInterval(timer)
    }
  })
}
