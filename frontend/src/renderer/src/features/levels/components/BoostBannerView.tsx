import type { CSSProperties } from 'react'
import type { BoostRank } from '../lib/boost'
import BoostSparks from './BoostSparks'
import './boost.css'

interface BoostBannerViewProps {
  eligible: number
  rank: BoostRank
}

/**
 * Desenho do banner de ativação do buff de XP. A festa cresce com o rank
 * (lib/boost.ts): D a A só deslizam a letra; S pisca as bordas; SS solta onda
 * de choque e faíscas; SSS também faz flash dourado de tela cheia e glitch.
 */
function BoostBannerView({ eligible, rank }: BoostBannerViewProps): React.JSX.Element {
  const vars = {
    '--boost-color': rank.color,
    '--boost-accent': rank.accent
  } as CSSProperties

  return (
    <div
      role="status"
      aria-label={`Buff de XP ${rank.label}: ${rank.text}`}
      className="pointer-events-none fixed inset-0 z-50"
      style={vars}
    >
      {rank.screenFlash && (
        <span
          aria-hidden="true"
          className="boost-flash boost-motion absolute inset-0"
          style={{ animation: `boost-flash ${rank.durationMs}ms ease-out both` }}
        />
      )}
      {rank.edgeFlash && (
        <span
          aria-hidden="true"
          className="boost-edge boost-motion absolute inset-0"
          style={{ animation: `boost-edge ${Math.min(1400, rank.durationMs)}ms ease-out both` }}
        />
      )}

      <div
        className="boost-anim absolute left-0 top-[calc(var(--titlebar-height,0px)+5rem)]"
        style={{ animation: `boost-banner ${rank.durationMs}ms ease-in-out both` }}
      >
        <div className="relative flex items-center gap-4 py-2 pl-6 pr-12">
          {/* Fundo recortado numa camada própria: o clip-path cortaria o anel e as faíscas. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ filter: `drop-shadow(0 0 15px ${rank.color}88)` }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(90deg, ${rank.accent}f2, #0b0b10f2 70%)`,
                borderBottom: `3px solid ${rank.color}`,
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 22px) 100%, 0 100%)'
              }}
            />
          </div>

          <span className="relative flex items-center justify-center">
            {rank.ring && (
              <span
                aria-hidden="true"
                className="boost-ring boost-motion absolute left-1/2 top-1/2 h-16 w-16"
                style={{ animation: 'boost-ring 0.9s ease-out 0.25s both' }}
              />
            )}
            <span className="boost-letter text-6xl" data-stage={rank.stage}>
              {rank.letter}
            </span>
          </span>

          <div className="relative leading-tight">
            <p className="boost-text text-lg">{rank.text}</p>
            <p className="text-xs font-bold text-gray-200">
              XP {rank.label}
              {eligible > 0 && ` · ${eligible} pessoas`}
            </p>
          </div>

          <BoostSparks count={rank.sparks} color={rank.color} />
        </div>
      </div>
    </div>
  )
}

export default BoostBannerView
