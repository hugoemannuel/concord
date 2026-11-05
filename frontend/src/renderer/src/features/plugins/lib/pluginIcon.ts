import { PuzzleIcon, SoccerBallIcon, type IconProps } from '../../../shared/ui/icons'
import type { PluginIconName } from '../api/plugins'

/** Ícone da ficha: só da lista fixa do app; qualquer outro valor cai no quebra-cabeça. */
export function pluginIcon(icon: PluginIconName | undefined): (p: IconProps) => React.JSX.Element {
  return icon === 'bola' ? SoccerBallIcon : PuzzleIcon
}
