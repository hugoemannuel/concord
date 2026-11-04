// Laço dos efeitos de canvas: ~30 fps em cima do requestAnimationFrame, dt em
// segundos já com a velocidade do tema e travado, e um quadro parado para
// quem pede menos movimento. As dependências vêm de fora (testável sem DOM).
import type { Ctx, EffectParams, Rand, Scene } from './types'

/** Maior passo de simulação, em segundos (aba que volta não dá salto). */
export const MAX_DT = 0.1
/** Quanto o quadro parado avança antes de desenhar, em segundos. */
export const STILL_SECONDS = 1.5
const STILL_STEP = 1 / 30

export interface EffectLoopOptions {
  scene: Scene
  params: EffectParams
  /** Contexto já escalado para px CSS (quem cuida do dpr é o chamador). */
  ctx: Ctx
  width: number
  height: number
  rand: Rand
  raf: (cb: (time: number) => void) => number
  caf: (id: number) => void
  fps?: number
  /** Passo depois do desenho, em tela (mistura de cor e brilho: postFx.ts). */
  post?: ((w: number, h: number, t: number) => void) | null
}

export interface EffectLoop {
  start(): void
  stop(): void
  resize(width: number, height: number): void
  renderStill(): void
}

/** Passo de simulação para `elapsedMs` de relógio. */
export function stepDt(elapsedMs: number, speed: number): number {
  return Math.min(MAX_DT, Math.max(0, (elapsedMs / 1000) * speed))
}

export function createEffectLoop(o: EffectLoopOptions): EffectLoop {
  // Aceita um quadro um pouco adiantado (o rAF de 60 Hz chega a cada ~16,7 ms).
  const frameMs = (1000 / (o.fps ?? 30)) * 0.9
  let w = o.width
  let h = o.height
  let state = o.scene.init(w, h, o.params, o.rand)
  let id: number | null = null
  let last = -1
  // Tempo de efeito (com a velocidade): o arco-íris anda junto.
  let clock = 0

  const paint = (): void => {
    o.ctx.clearRect(0, 0, w, h)
    o.ctx.save()
    o.scene.draw(o.ctx, state)
    o.ctx.restore()
    o.post?.(w, h, clock)
  }

  const advance = (time: number): void => {
    const elapsed = last < 0 ? 0 : time - last
    last = time
    const dt = stepDt(elapsed, o.params.speed)
    clock = (clock + dt) % 3600
    o.scene.step(state, dt, o.rand)
    paint()
  }

  const tick = (time: number): void => {
    id = o.raf(tick)
    if (last >= 0 && time - last < frameMs) return
    advance(time)
  }

  return {
    start() {
      if (id !== null) return
      last = -1
      id = o.raf(tick)
    },
    stop() {
      if (id === null) return
      o.caf(id)
      id = null
    },
    resize(width, height) {
      w = width
      h = height
      state = o.scene.init(w, h, o.params, o.rand)
    },
    renderStill() {
      state = o.scene.init(w, h, o.params, o.rand)
      const dt = stepDt(STILL_STEP * 1000, o.params.speed)
      const steps = Math.round(STILL_SECONDS / STILL_STEP)
      for (let i = 0; i < steps; i++) o.scene.step(state, dt, o.rand)
      paint()
    }
  }
}
