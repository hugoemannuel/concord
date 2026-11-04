import { useMemo, type CSSProperties } from 'react'
import { particleColor, type FxLook } from '../lib/effectLook'
import type { ProfileThemeLook } from '../lib/profileTheme'
import { effectParticles, type Particle } from '../lib/profileParticles'
import EffectCanvas from './EffectCanvas'
import '../../../assets/profileTheme.css'

/** Estrelinha dos brilhos (o mesmo ✦ do efeito de nome). */
// design-allow: efeito visual (a estrelinha é o próprio desenho da partícula)
const SPARKLE = '✦'
/** Raio do brilho das partículas de CSS no máximo, em px. */
const CSS_GLOW_PX = 18

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

/** A cor da partícula na mistura, pela variável que o CSS lê. */
function tintedStyle(style: CSSProperties, color: string | null): CSSProperties {
  return color ? ({ ...style, '--pt-fxc': color } as CSSProperties) : style
}

/** Classe da área: "só o banner" limita a altura da camada (assets/profileTheme.css). */
function areaClass(look: FxLook): string {
  return look.area === 'banner' ? ' pt-area-banner' : ''
}

/** Opacidade da camada: compositor, não redesenha nada. */
function opacityStyle(look: FxLook): CSSProperties | undefined {
  return look.opacity < 1 ? { opacity: look.opacity } : undefined
}

function CssEffect({ fx }: { fx: EffectFx }): React.JSX.Element {
  const { density, speed, color } = fx.params
  const { size, palette, color2, glow } = fx.look
  const particles = useMemo(
    () => effectParticles(fx.id, density, speed, size),
    [fx.id, density, speed, size]
  )
  const glyph = fx.id === 'sparkles' ? SPARKLE : null
  const style = { ...opacityStyle(fx.look), '--pt-fxg': `${glow * CSS_GLOW_PX}px` } as CSSProperties
  return (
    <div
      aria-hidden="true"
      className={`pt-fx pt-fx-${fx.id}${areaClass(fx.look)}`}
      style={glow > 0 || fx.look.opacity < 1 ? style : undefined}
    >
      {particles.map((p, i) => (
        <span
          key={i}
          style={tintedStyle(
            particleStyle(fx.id, p),
            particleColor(palette, color, color2, i, particles.length)
          )}
        >
          {glyph}
        </span>
      ))}
    </div>
  )
}

/**
 * O efeito animado (partículas em CSS ou a cena em canvas) que cobre o pai
 * inteiro ou só o banner, sem clique. Usado no cartão de perfil
 * (ProfileCardFrame) e no fundo do app dos temas próprios (features/appearance).
 */
export default function EffectLayer({ fx }: { fx: EffectFx }): React.JSX.Element | null {
  if (fx.kind === 'css') return <CssEffect fx={fx} />
  if (fx.kind === 'canvas') {
    return (
      <EffectCanvas
        effect={fx.id}
        params={fx.params}
        look={fx.look}
        className={`pt-fx${areaClass(fx.look)}`}
        style={opacityStyle(fx.look)}
      />
    )
  }
  return null
}
