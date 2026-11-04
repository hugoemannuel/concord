// Só para testes: um contexto 2D falso que grava as chamadas e acusa número
// inválido (NaN/Infinity) passado para qualquer método.
import type { Ctx } from './types'

export type FakeCtx = Ctx & {
  calls: string[]
  /** Chamadas que receberam número não finito. */
  bad: string[]
  setTransform: CanvasRenderingContext2D['setTransform']
}

const METHODS = [
  'clearRect',
  'fillRect',
  'strokeRect',
  'beginPath',
  'closePath',
  'moveTo',
  'lineTo',
  'arc',
  'ellipse',
  'quadraticCurveTo',
  'bezierCurveTo',
  'fill',
  'stroke',
  'fillText',
  'save',
  'restore',
  'translate',
  'rotate',
  'scale',
  'setTransform',
  'drawImage'
] as const

export function fakeCtx(): FakeCtx {
  const calls: string[] = []
  const bad: string[] = []
  const record = (name: string, args: unknown[]): void => {
    calls.push(name)
    if (args.some((a) => typeof a === 'number' && !Number.isFinite(a))) bad.push(name)
  }
  const gradient =
    (name: string) =>
    (...args: unknown[]) => {
      record(name, args)
      return { addColorStop: () => {} }
    }
  const ctx: Record<string, unknown> = {
    calls,
    bad,
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    lineCap: 'butt',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowBlur: 0,
    shadowColor: 'transparent',
    createLinearGradient: gradient('createLinearGradient'),
    createRadialGradient: gradient('createRadialGradient')
  }
  for (const m of METHODS) ctx[m] = (...args: unknown[]) => record(m, args)
  // Números atribuídos também são conferidos.
  for (const prop of ['globalAlpha', 'lineWidth', 'shadowBlur']) {
    let value = ctx[prop]
    Object.defineProperty(ctx, prop, {
      get: () => value,
      set: (v: unknown) => {
        record(prop, [v])
        value = v
      }
    })
  }
  return ctx as unknown as FakeCtx
}
