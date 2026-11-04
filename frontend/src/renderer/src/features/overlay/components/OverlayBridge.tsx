import { useEffect, useMemo, useRef } from 'react'
import { mergeCallPeople } from '../../call/lib/callParticipants'
import { buildOverlaySnapshot, sameOverlaySnapshot, type OverlaySnapshot } from '../lib/overlayState'
import { serverDisplayName, withServerNames } from '../../servers/lib/serverNames'
import { useCallServerProfiles } from '../../serverProfiles/hooks/useCallServerProfiles'
import { withServerProfiles } from '../../serverProfiles/lib/serverProfile'
import { useCallNicknames } from '../../servers/hooks/useServerNames'
import { useAuthStore } from '../../auth/store/authStore'
import { useCallStore } from '../../call/store/callStore'
import { API_BASE_URL } from '../../../shared/lib/config'
import { useOverlayPrefsStore } from '../store/overlayPrefsStore'
import { useServerStore } from '../../servers/store/serverStore'
import { useOverlayTheme } from '../hooks/useOverlayTheme'
import { useMyLiveWatchers } from '../hooks/useMyLiveWatchers'

/** Store que muda sem mudar o que o overlay mostra não vira IPC nem repaint no jogo. */
function sendIfChanged(
  overlay: { setState: (state: OverlaySnapshot) => void },
  lastSent: { current: OverlaySnapshot | null },
  next: OverlaySnapshot
): void {
  if (sameOverlaySnapshot(lastSent.current, next)) return
  lastSent.current = next
  overlay.setState(next)
}

/**
 * Manda ao main o estado da call para o overlay de jogo (só Windows). A lista
 * é a mesma do palco: backend + quem está na sala de mídia.
 */
function OverlayBridge(): null {
  const overlay = window.api?.overlay
  const enabled = useOverlayPrefsStore((s) => s.enabled)
  const opacity = useOverlayPrefsStore((s) => s.opacity)
  const layout = useOverlayPrefsStore((s) => s.layout)
  const shortcut = useOverlayPrefsStore((s) => s.shortcut)
  const setLayout = useOverlayPrefsStore((s) => s.setLayout)
  const me = useAuthStore((s) => s.user)
  const status = useCallStore((s) => s.status)
  const backendParticipants = useCallStore((s) => s.participants)
  const mediaPeers = useCallStore((s) => s.mediaPeers)
  const voiceStates = useCallStore((s) => s.voiceStates)
  const speakingIds = useCallStore((s) => s.speakingIds)
  const muted = useCallStore((s) => s.muted)
  const deafened = useCallStore((s) => s.deafened)
  const members = useServerStore((s) => s.currentMembers)
  // Só o overlay nativo do Windows usa (a página do Electron lê o CSS).
  const theme = useOverlayTheme()

  const lastSent = useRef<OverlaySnapshot | null>(null)
  const meId = me?.id ?? null
  const liveWatchers = useMyLiveWatchers(meId)
  // Call num canal de voz: apelidos daquele servidor (mesmo olhando outro).
  const nicknames = useCallNicknames()
  // A janela do overlay recebe URLs prontas: o avatar do servidor vai resolvido.
  const serverProfiles = useCallServerProfiles()
  const participants = useMemo(
    () =>
      withServerProfiles(
        withServerNames(
          mergeCallPeople(backendParticipants, mediaPeers, meId, (id) => {
            const m = members.find((x) => x.user_id === id)
            return m?.display_name || m?.username
          }),
          nicknames
        ),
        serverProfiles
      ),
    [backendParticipants, mediaPeers, meId, members, nicknames, serverProfiles]
  )
  const meInOverlay = useMemo(() => {
    const named =
      me && meId && nicknames?.[meId]
        ? { ...me, display_name: serverDisplayName({ nickname: nicknames[meId] }, me) }
        : me
    return named && withServerProfiles([named], serverProfiles)[0]
  }, [me, meId, nicknames, serverProfiles])

  // Posição/tamanho editados no jogo (Shift+Tab) chegam pelo main: salva aqui.
  useEffect(() => {
    if (!overlay?.supported) return
    return overlay.onLayout(setLayout)
  }, [overlay, setLayout])

  useEffect(() => {
    if (!overlay?.supported) return
    const next = buildOverlaySnapshot({
      enabled,
      status,
      me: meInOverlay,
      participants,
      voiceStates,
      speakingIds,
      muted,
      deafened,
      opacity,
      layout,
      shortcut,
      liveWatchers,
      mediaBase: API_BASE_URL,
      theme
    })
    sendIfChanged(overlay, lastSent, next)
  }, [
    overlay,
    enabled,
    opacity,
    layout,
    shortcut,
    liveWatchers,
    status,
    meInOverlay,
    participants,
    voiceStates,
    speakingIds,
    muted,
    deafened,
    theme
  ])

  return null
}

export default OverlayBridge
