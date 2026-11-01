import { useServerLevel } from '../hooks/useServerLevel'
import { serverLevelBadge } from '../lib/serverLevelScene'
import { replayServerLevelUp } from '../lib/serverLevelUpStart'
import './serverLevelUp.css'

/**
 * Selo "Nv. N" do servidor, no material da faixa (bronze, prata, ouro…).
 * É um botão: clicar (ou Enter/Espaço) toca a animação do nível atual, como
 * o selo de nível no perfil de uma pessoa.
 */
function ServerLevelChip({ serverId }: { serverId: string }): React.JSX.Element | null {
  const progress = useServerLevel(serverId)
  if (!progress) return null
  const look = serverLevelBadge(progress.level)
  return (
    <button
      type="button"
      onClick={() => replayServerLevelUp(serverId)}
      title={`Nível ${progress.level} do servidor · ${look.name} · clique para ver a animação`}
      aria-label="Ver animação do nível do servidor"
      data-tier={look.name}
      // O ::after estica a área de toque sem mexer no visual do selo.
      className={`relative shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 text-ds-xxs font-bold leading-none transition-transform after:absolute after:-inset-2 after:content-[''] hover:scale-105 active:scale-95 focus-ring ${look.className}`}
      style={look.style}
    >
      Nv. {progress.level}
    </button>
  )
}

export default ServerLevelChip
