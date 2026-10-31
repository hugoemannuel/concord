import { useLevelStore } from '../../levels/store/levelStore'
import { levelUpEffects } from '../../levels/lib/levels'

/** Subida de nível: do 60 em diante o tile brilha na cor da faixa. */
export default function LevelGlow({
  userId,
  isScreen
}: {
  userId: string
  isScreen: boolean
}): React.JSX.Element | null {
  const celebration = useLevelStore((s) => (isScreen ? undefined : s.celebrations[userId]))
  if (!celebration) return null
  const fx = levelUpEffects(celebration.level, celebration.previous)
  if (!fx.tileGlow) return null
  return (
    <span
      key={celebration.key}
      aria-hidden="true"
      className="level-anim pointer-events-none absolute inset-0 z-[1] rounded-2xl"
      style={{
        boxShadow: `inset 0 0 ${Math.round(24 + 32 * fx.glow)}px ${Math.round(4 + 8 * fx.glow)}px ${fx.tier.color}, inset 0 0 0 2px ${fx.tier.color}`,
        animation: 'level-tile-glow 1.6s ease-in-out 2 both'
      }}
    />
  )
}
