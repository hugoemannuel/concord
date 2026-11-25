import { useEffect, useState } from 'react'
import { router } from '../../../app/router'
import { useAuthStore } from '../../auth/store/authStore'
import { CHANGELOG_PATH } from '../../improvements/lib/hub'
import { useReleaseGateStore } from '../store/releaseGateStore'
import { gateView, seenToWrite, type GateView } from '../lib/releaseGate'
import { readSeenVersion, writeSeenVersion } from '../lib/seenVersion'
import RequiredUpdateModal from './RequiredUpdateModal'
import WhatsNewModal from './WhatsNewModal'

// Em desenvolvimento a versão é a do package.json, não a publicada: sem isso,
// o app de dev ligado a um servidor com versão obrigatória ficaria bloqueado.
const ENFORCE_MIN_VERSION = !import.meta.env.DEV

function GateModal({
  view,
  onSeen
}: {
  view: GateView
  onSeen(version: string): void
}): React.JSX.Element | null {
  if (view.kind === 'required') {
    return <RequiredUpdateModal installed={view.installed} minVersion={view.minVersion} />
  }
  if (view.kind !== 'whatsNew') return null
  return (
    <WhatsNewModal
      groups={view.groups}
      onClose={() => onSeen(view.current)}
      onSeeAll={() => {
        onSeen(view.current)
        void router.navigate(CHANGELOG_PATH)
      }}
    />
  )
}

/**
 * Atualização obrigatória e novidades (ADR 0066), depois do login: carrega a
 * versão mínima e as releases e mostra o modal certo. Montado uma vez no App.
 */
function ReleaseGate(): React.JSX.Element | null {
  const logged = useAuthStore((s) => Boolean(s.accessToken))
  const store = useReleaseGateStore()
  const gate = ENFORCE_MIN_VERSION ? store : { ...store, minVersion: null }
  const [seen, setSeen] = useState(readSeenVersion)
  const view = logged ? gateView(gate, seen) : ({ kind: 'none', current: null } as const)

  const markSeen = (version: string): void => {
    writeSeenVersion(version)
    setSeen(version)
  }

  useEffect(() => {
    if (logged) void useReleaseGateStore.getState().load()
  }, [logged])

  // Só grava: o seen do estado fica, e a tela não muda (nada para mostrar).
  const toWrite = seenToWrite(view, seen)
  useEffect(() => {
    if (toWrite) writeSeenVersion(toWrite)
  }, [toWrite])

  return <GateModal view={view} onSeen={markSeen} />
}

export default ReleaseGate
