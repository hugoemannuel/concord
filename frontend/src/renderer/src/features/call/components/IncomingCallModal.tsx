import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCallStore } from '../store/callStore'
import { playSound, stopSound } from '../lib/sounds'
import { PhoneIcon, PhoneOffIcon } from '../../../shared/ui/icons'
import Button from '../../../shared/ui/Button'
// Avatar de quem está na chamada: o GIF segue a regra da call (ver CallAvatar).
import Avatar from './CallAvatar'
import StyledName from '../../profile/components/StyledName'

/** O toque repete enquanto a chamada toca (o som cabe no intervalo). */
const RING_INTERVAL_MS = 2000

/** Toque da chamada recebida: o som escolhido em Configurações → Notificações. */
function useRingtone(ringing: boolean): void {
  useEffect(() => {
    if (!ringing) return
    playSound('ring')
    const timer = setInterval(() => playSound('ring'), RING_INTERVAL_MS)
    return () => {
      clearInterval(timer)
      stopSound('ring')
    }
  }, [ringing])
}

function IncomingCallModal(): React.JSX.Element | null {
  const navigate = useNavigate()
  const status = useCallStore((s) => s.status)
  const peer = useCallStore((s) => s.participants[0] ?? null)
  const acceptCall = useCallStore((s) => s.acceptCall)
  const declineCall = useCallStore((s) => s.declineCall)

  useRingtone(status === 'ringing')

  if (status !== 'ringing' || !peer) return null

  const handleAccept = (): void => {
    void acceptCall().then(() => {
      // Estilo Discord: ao aceitar, abre a view de chamada na conversa.
      navigate(`/dm/${peer.id}`)
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="rounded-xl border border-subtle bg-modal shadow-2xl shadow-black/70 w-full max-w-sm p-8 text-center">
        <Avatar
          userId={peer.id}
          name={peer.display_name}
          avatarUrl={peer.avatar_url}
          size={80}
          animate="always"
          className="mx-auto mb-4"
        />
        <p className="text-ds-lg font-bold text-strong">
          <StyledName name={peer.display_name} userId={peer.id} style={peer.name_style} />
        </p>
        <p className="mb-6 text-ds-xs text-muted">@{peer.username}</p>
        <p className="mb-6 animate-pulse text-ds-sm font-semibold text-secondary">Chamada de voz…</p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="danger" onClick={declineCall} aria-label="Recusar chamada">
            <PhoneOffIcon className="h-5 w-5" />
          </Button>
          <Button variant="success" onClick={handleAccept} aria-label="Aceitar chamada">
            <PhoneIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default IncomingCallModal
