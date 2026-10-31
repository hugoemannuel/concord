import type { BoostRank } from '../lib/boost'
import { type XpTierColors, xpFillStyle } from '../lib/boostBar'
import BoostEmbers from './BoostEmbers'
import BoostShine from './BoostShine'

interface XpProgressBarProps {
  percent: number
  tier: XpTierColors
  paused: boolean
  rank: BoostRank | null
}

/** Trilho da barra de XP; com buff (e sem pausa) leva o brilho e as brasas do rank. */
function XpProgressBar({ percent, tier, paused, rank }: XpProgressBarProps): React.JSX.Element {
  const fx = paused ? null : rank
  return (
    <div className="relative">
      <div className="h-1.5 overflow-hidden rounded-full bg-fg/10">
        <div
          className="relative h-full overflow-hidden rounded-full transition-[width] duration-700"
          style={{ width: `${percent}%`, ...xpFillStyle(tier, paused) }}
        >
          {fx && <BoostShine shineMs={fx.shineMs} />}
        </div>
      </div>
      {fx && <BoostEmbers color={fx.color} count={fx.embers} />}
    </div>
  )
}

export default XpProgressBar
