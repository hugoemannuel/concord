import type { ComponentType } from 'react'
import {
  ArrowUpIcon,
  BoltIcon,
  BubblesIcon,
  BuntingIcon,
  CircleSlashIcon,
  CloudIcon,
  ConfettiIcon,
  FireflyIcon,
  FireworksIcon,
  FlameIcon,
  FogIcon,
  GalaxyIcon,
  GlitchIcon,
  GridIcon,
  HeartIcon,
  HexagonIcon,
  LavaIcon,
  LeafIcon,
  MatrixIcon,
  MeteorIcon,
  MoneyIcon,
  OceanIcon,
  ParticlesIcon,
  PetalIcon,
  PixelIcon,
  RainIcon,
  SnowIcon,
  SparkleIcon,
  SunbeamIcon,
  WaveIcon,
  type IconProps
} from '../../../../../shared/ui/icons'

/** Ícone de cada efeito do perfil (chips do editor e selo das predefinições). */
export const EFFECT_ICONS: Record<string, ComponentType<IconProps>> = {
  none: CircleSlashIcon,
  particles: ParticlesIcon,
  sparkles: SparkleIcon,
  snow: SnowIcon,
  fire: FlameIcon,
  matrix: MatrixIcon,
  glitch: GlitchIcon,
  storm: BoltIcon,
  galaxy: GalaxyIcon,
  aurora: WaveIcon,
  hearts: HeartIcon,
  confetti: ConfettiIcon,
  synthwave: GridIcon,
  rain: RainIcon,
  fireflies: FireflyIcon,
  sakura: PetalIcon,
  leaves: LeafIcon,
  bubbles: BubblesIcon,
  ocean: OceanIcon,
  meteors: MeteorIcon,
  fog: FogIcon,
  sunbeams: SunbeamIcon,
  lava: LavaIcon,
  money: MoneyIcon,
  clouds: CloudIcon,
  hexagons: HexagonIcon,
  pixels: PixelIcon,
  bunting: BuntingIcon,
  fireworks: FireworksIcon
}

/** Seta da direção do degradê: a mesma seta para cima, girada pelo ângulo (0° = cima). */
export function gradientArrow(angle: number): ComponentType<IconProps> {
  function GradientArrow(props: IconProps): React.JSX.Element {
    return <ArrowUpIcon {...props} style={{ rotate: `${angle}deg` }} />
  }
  return GradientArrow
}
