import { useActiveBoostBanner } from '../hooks/useBoostBanner'
import BoostBannerEffects from './BoostBannerEffects'
import BoostBannerView from './BoostBannerView'

/**
 * Banner de ativação do buff de XP (quando a call ganha buff ou sobe de rank),
 * com o som do rank. Só existe para quem está na call do buff e não está
 * mutado/surdo (ver `pickBoostBanner`).
 */
function BoostBanner(): React.JSX.Element | null {
  const active = useActiveBoostBanner()
  if (!active) return null

  const { celebration, rank } = active
  return (
    <>
      <BoostBannerEffects key={celebration.key} celebrationKey={celebration.key} rank={rank} />
      <BoostBannerView key={celebration.key} eligible={celebration.eligible} rank={rank} />
    </>
  )
}

export default BoostBanner
