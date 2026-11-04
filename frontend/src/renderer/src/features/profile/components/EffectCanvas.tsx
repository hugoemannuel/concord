import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { FxLook } from '../lib/effectLook'
import { browserEnv } from '../lib/effects/browserEnv'
import { canvasScene, seededRand } from '../lib/effects'
import { mountEffect } from '../lib/effects/mount'
import type { EffectParams, Scene } from '../lib/effects/types'
import { viewScene } from '../lib/effects/view'
import '../../../assets/profileTheme.css'

/** Sem ajuste nenhum (quem só usa a cena). */
const PLAIN: FxLook = {
  size: 1,
  flow: null,
  direction: 'default',
  opacity: 1,
  palette: 'single',
  color2: '#ffffff',
  area: 'full',
  glow: 0
}

/** Liga a cena ao canvas enquanto o efeito e os parâmetros não mudam. */
function useEffectScene(
  ref: React.RefObject<HTMLCanvasElement | null>,
  scene: Scene | null,
  { density, speed, color }: EffectParams,
  { palette, color2, glow }: FxLook
): void {
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !scene) return
    return mountEffect(canvas, {
      scene,
      params: { density, speed, color },
      env: browserEnv(),
      rand: seededRand(Math.floor(Math.random() * 2 ** 32)),
      postFx: { palette, color, color2, glow }
    })
  }, [ref, scene, density, speed, color, palette, color2, glow])
}

/**
 * Efeito animado do cartão de perfil desenhado num <canvas> por cima do
 * cartão (sem clique, decorativo). A lógica fica em lib/effects; aqui só
 * liga a cena ao elemento. Efeito que não é de canvas → nada.
 */
export default function EffectCanvas({
  effect,
  params,
  look = PLAIN,
  className = 'pt-fx',
  style
}: {
  effect: string
  params: EffectParams
  look?: FxLook
  className?: string
  style?: CSSProperties
}): React.JSX.Element | null {
  const ref = useRef<HTMLCanvasElement>(null)
  const { size, flow, direction } = look
  const base = canvasScene(effect)
  const scene = useMemo(
    () => base && viewScene(base, { size, flow, direction }),
    [base, size, flow, direction]
  )
  useEffectScene(ref, scene, params, look)
  if (!scene) return null
  return <canvas ref={ref} aria-hidden="true" className={className} style={style} />
}
