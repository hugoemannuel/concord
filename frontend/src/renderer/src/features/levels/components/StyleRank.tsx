import { boostRank } from '../lib/boost'
import './boost.css'

interface StyleRankProps {
  percent: number
  /** XP pausado (mutado/surdo): rank apagado em cinza. */
  paused?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Letra do rank do buff de XP (D a SSS), o texto ("Sweet!") e o
 * multiplicador. Não renderiza nada sem buff. Trocar de rank remonta a letra
 * (a `key`), o que dispara de novo o slam.
 */
function StyleRank({
  percent,
  paused = false,
  size = 'sm',
  className = ''
}: StyleRankProps): React.JSX.Element | null {
  const rank = boostRank(percent)
  if (!rank) return null

  const vars = {
    '--boost-color': paused ? '#6b7280' : rank.color,
    '--boost-accent': paused ? '#374151' : rank.accent
  } as React.CSSProperties

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      style={vars}
      title={`Buff de XP ${rank.label} (${rank.text})`}
    >
      <span
        key={rank.letter}
        className={`boost-letter ${size === 'md' ? 'text-3xl' : 'text-xl'}`}
        data-stage={rank.stage}
        data-paused={paused}
      >
        {rank.letter}
      </span>
      <span className="flex flex-col leading-none">
        <span className={`boost-text ${size === 'md' ? 'text-xs' : 'text-[10px]'}`}>
          {rank.text}
        </span>
        <span className={`font-bold text-gray-300 ${size === 'md' ? 'text-[11px]' : 'text-[9px]'}`}>
          XP {rank.label}
        </span>
      </span>
    </span>
  )
}

export default StyleRank
