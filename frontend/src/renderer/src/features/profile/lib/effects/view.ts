// Tamanho e direção de qualquer cena sem mexer nela: a cena continua achando que
// desenha no seu sentido de sempre, num "mundo" do tamanho que couber, e o
// contexto é girado/ampliado antes do desenho (ADR 0054). Sem ajuste, a própria
// cena volta intacta: quem não mexeu nas opções desenha igual a antes.
import type { Ctx, Scene } from './types'

export type Flow = 'up' | 'down' | 'left' | 'right'
export type Direction = Flow | 'default'

export interface EffectView {
  /** Fator de tamanho (1 = o de sempre). */
  size: number
  /** Sentido de sempre da cena; null = não anda para lado nenhum. */
  flow: Flow | null
  direction: Direction
}

/** Na ordem em que um quarto de volta (rotate(90°), horário) leva um no outro. */
const CLOCKWISE: Flow[] = ['down', 'left', 'up', 'right']

/** Quantos quartos de volta levam o sentido da cena ao pedido. */
export function quarterTurns(flow: Flow | null, direction: Direction): number {
  if (!flow || direction === 'default') return 0
  return (CLOCKWISE.indexOf(direction) - CLOCKWISE.indexOf(flow) + 4) % 4
}

/** O tamanho do mundo em que a cena vive para uma área de w×h na tela. */
export function worldSize(w: number, h: number, v: EffectView): [number, number] {
  const sideways = quarterTurns(v.flow, v.direction) % 2 === 1
  return sideways ? [h / v.size, w / v.size] : [w / v.size, h / v.size]
}

/** Meia-volta é espelho (a figura não fica deitada) no eixo em que a cena anda. */
function isHorizontal(flow: Flow | null): boolean {
  return flow === 'left' || flow === 'right'
}

/** Onde um ponto do mundo cai na tela (o mesmo que applyView faz no contexto). */
export function screenPoint(x: number, y: number, w: number, h: number, v: EffectView): [number, number] {
  const [sx, sy] = [x * v.size, y * v.size]
  const turns = quarterTurns(v.flow, v.direction)
  if (turns === 1) return [w - sy, sx]
  if (turns === 3) return [sy, h - sx]
  if (turns === 0) return [sx, sy]
  return isHorizontal(v.flow) ? [w - sx, sy] : [sx, h - sy]
}

function applyTurn(ctx: Ctx, w: number, h: number, v: EffectView): void {
  const turns = quarterTurns(v.flow, v.direction)
  if (turns === 1) {
    ctx.translate(w, 0)
    ctx.rotate(Math.PI / 2)
  } else if (turns === 3) {
    ctx.translate(0, h)
    ctx.rotate(-Math.PI / 2)
  } else if (turns === 2 && isHorizontal(v.flow)) {
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
  } else if (turns === 2) {
    ctx.translate(0, h)
    ctx.scale(1, -1)
  }
}

interface ViewState {
  inner: unknown
  w: number
  h: number
}

/** A cena com o tamanho e a direção aplicados. */
export function viewScene(scene: Scene, v: EffectView): Scene {
  if (v.size === 1 && quarterTurns(v.flow, v.direction) === 0) return scene
  // Coisa maior anda mais px por segundo; a raiz segura sem deixar tudo em câmera lenta.
  const pace = 1 / Math.sqrt(v.size)
  const wrapped: Scene<ViewState> = {
    init(w, h, p, rand) {
      const [wx, wy] = worldSize(w, h, v)
      return { inner: scene.init(wx, wy, p, rand), w, h }
    },
    step(s, dt, rand) {
      scene.step(s.inner, dt * pace, rand)
    },
    draw(ctx, s) {
      applyTurn(ctx, s.w, s.h, v)
      if (v.size !== 1) ctx.scale(v.size, v.size)
      scene.draw(ctx, s.inner)
    }
  }
  return wrapped as Scene
}
