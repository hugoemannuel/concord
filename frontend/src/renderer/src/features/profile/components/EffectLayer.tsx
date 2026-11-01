import { useMemo, type CSSProperties } from 'react'
import type { ProfileThemeLook } from '../lib/profileTheme'
import { effectParticles, type Particle } from '../lib/profileParticles'
import EffectCanvas from './EffectCanvas'
import '../../../assets/profileTheme.css'

/** Estrelinha dos brilhos (o mesmo ✦ do efeito de nome). */
// design-allow: efeito visual (a estrelinha é o próprio desenho da partícula)
const SPARKLE = '✦'

export type EffectFx = ProfileThemeLook['fx']

/** Estilo de uma partícula: neve cai do topo; brilho é texto; o resto, bolinha. */
function particleStyle(effect: string, p: Particle): CSSProperties {
  const size = effect === 'sparkles' ? { fontSize: p.size } : { width: p.size, height: p.size }
  return {
    left: `${p.left}%`,
    top: effect === 'snow' ? '-8px' : `${p.top}%`,
    ...size,
    // Atraso negativo: abre já com o efeito no meio, não vazio.
    animationDelay: `-${p.delay}s`,
    animationDuration: `${p.duration}s`
  }
}

function CssEffect({ fx }: { fx: EffectFx }): React.JSX.Element {
  const { density, speed } = fx.params
  const particles = useMemo(() => effectParticles(fx.id, density, speed), [fx.id, density, speed])
  const glyph = fx.id === 'sparkles' ? SPARKLE : null
  return (
    <div aria-hidden="true" className={`pt-fx pt-fx-${fx.id}`}>
      {particles.map((p, i) => (
        <span key={i} style={particleStyle(fx.id, p)}>
          {glyph}
        </span>
      ))}
    </div>
  )
}

/**
 * O efeito animado (partículas em CSS ou a cena em canvas) que cobre o pai
 * inteiro, sem clique. Usado no cartão de perfil (ProfileCardFrame) e no fundo
 * do app dos temas próprios (features/appearance).
 */
export default function EffectLayer({ fx }: { fx: EffectFx }): React.JSX.Element | null {
  if (fx.kind === 'css') return <CssEffect fx={fx} />
  if (fx.kind === 'canvas') return <EffectCanvas effect={fx.id} params={fx.params} />
  return null
}
