import { useLevelStore } from '../store/levelStore'
import { boostRank } from '../lib/boost'
import StyleRank from './StyleRank'
import XpProgressBar from './XpProgressBar'
import { useMyBoostPercent } from '../hooks/useMyBoost'
import { formatVoiceTime, levelPercent, levelTier, minutesToNext } from '../lib/levels'

/** Barra de XP de quem está logado, no painel "Voz conectada". */
function VoiceXPBar({ paused }: { paused: boolean }): React.JSX.Element | null {
  const me = useLevelStore((s) => s.me)
  const boostPercent = useMyBoostPercent()
  if (!me) return null

  const rank = boostRank(boostPercent)

  const tier = levelTier(me.level)
  const percent = levelPercent(me.xp_into_level, me.xp_for_next)
  const minutes = minutesToNext(me.xp_into_level, me.xp_for_next)

  return (
    <div
      className="mt-2 px-0.5"
      title={`${formatVoiceTime(me.voice_seconds)} de call no total · faltam ~${minutes} min para o nível ${me.level + 1}`}
    >
      {rank && <StyleRank percent={boostPercent} paused={paused} className="mb-1" />}
      <div className="mb-1 flex items-baseline justify-between text-[10px]">
        <span className="font-bold" style={{ color: paused ? 'var(--text-faint)' : tier.color }}>
          Nível {me.level}
        </span>
        <span className="text-gray-500">
          {paused ? 'XP pausado (mutado)' : `${me.xp_into_level}/${me.xp_for_next} XP`}
        </span>
      </div>
      <XpProgressBar percent={percent} tier={tier} paused={paused} rank={rank} />
    </div>
  )
}

export default VoiceXPBar
