import { useCallStore } from '../store/callStore'
import { boostRank } from '../../levels/lib/boost'
import { useMyBoostPercent } from '../../levels/hooks/useMyBoost'
import { formatDuration, useElapsed } from '../lib/callUtils'
import '../../levels/components/boost.css'

/**
 * Por cima da chamada em que estou: a aura do boost (falando) e o selo "Voz
 * conectada" com o tempo. O rank de estilo fica só na barra de XP do painel de voz.
 */
function VoiceConnectedBadges(): React.JSX.Element {
  const startedAt = useCallStore((s) => s.startedAt)
  const paused = useCallStore((s) => s.muted || s.deafened)
  const boostPercent = useMyBoostPercent()
  const rank = boostRank(boostPercent)
  const elapsed = useElapsed(startedAt)
  return (
    <>
      {rank?.aura && !paused && (
        <span
          aria-hidden="true"
          className="boost-aura boost-motion pointer-events-none absolute inset-0 z-0"
          style={{ '--boost-color': `${rank.color}66` } as React.CSSProperties}
        />
      )}
      {/* À direita fica o botão do chat do canal. */}
      <div className="absolute right-16 top-3 z-10 flex items-center gap-2 rounded-full border border-success/30 bg-success/15 px-3 py-1 text-ds-xs font-semibold text-success">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
        Voz conectada · {formatDuration(elapsed)}
      </div>
    </>
  )
}

export default VoiceConnectedBadges
