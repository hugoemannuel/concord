import { describe, expect, it, vi } from 'vitest'
import { fakeCtx, type FakeCtx } from './fakeCtx'
import { seededRand } from './index'
import { createEffectLoop, MAX_DT, stepDt, type EffectLoop } from './loop'
import type { EffectParams, Scene } from './types'

interface Spy {
  steps: number[]
  draws: number
}

/** Cena de mentira que só anota os passos e os desenhos. */
function spyScene(): { scene: Scene<Spy>; inits: number[][] } {
  const inits: number[][] = []
  const scene: Scene<Spy> = {
    init: (w, h) => {
      inits.push([w, h])
      return { steps: [], draws: 0 }
    },
    step: (s, dt) => {
      s.steps.push(dt)
    },
    draw: (_ctx, s) => {
      s.draws++
    }
  }
  return { scene, inits }
}

/** rAF manual: `frame(t)` roda o callback pendente no tempo t. */
function fakeRaf(): {
  raf: (cb: (t: number) => void) => number
  caf: ReturnType<typeof vi.fn>
  frame: (t: number) => void
  pending: () => boolean
} {
  let cb: ((t: number) => void) | null = null
  let id = 0
  return {
    raf: (fn) => {
      cb = fn
      return ++id
    },
    caf: vi.fn(() => {
      cb = null
    }),
    frame: (t) => {
      const fn = cb
      cb = null
      fn?.(t)
    },
    pending: () => cb !== null
  }
}

interface Setup {
  loop: EffectLoop
  r: ReturnType<typeof fakeRaf>
  ctx: FakeCtx
  inits: number[][]
  state: () => Spy
}

function setup(params: Partial<EffectParams> = {}): Setup {
  const { scene, inits } = spyScene()
  const r = fakeRaf()
  const ctx = fakeCtx()
  let state: Spy | null = null
  const wrapped: Scene<Spy> = {
    ...scene,
    init: (...args) => (state = scene.init(...args))
  }
  const loop = createEffectLoop({
    scene: wrapped as Scene,
    params: { density: 1, speed: 1, color: '#ffffff', ...params },
    ctx,
    width: 300,
    height: 400,
    rand: seededRand(1),
    raf: r.raf,
    caf: r.caf
  })
  return { loop, r, ctx, inits, state: () => state as unknown as Spy }
}

describe('stepDt', () => {
  it('converte para segundos, aplica a velocidade e trava em 0,1', () => {
    expect(stepDt(33, 1)).toBeCloseTo(0.033)
    expect(stepDt(33, 2)).toBeCloseTo(0.066)
    expect(stepDt(5000, 1)).toBe(MAX_DT)
    expect(stepDt(-10, 1)).toBe(0)
  })
})

describe('createEffectLoop', () => {
  it('limita a ~30 fps: num rAF de 60 Hz desenha um quadro sim, outro não', () => {
    const { loop, r, state } = setup()
    loop.start()
    for (let i = 0; i <= 60; i++) r.frame(i * (1000 / 60))
    // Primeiro quadro + 30 quadros em 1 s.
    expect(state().draws).toBe(31)
    expect(state().steps[0]).toBe(0)
    expect(state().steps[1]).toBeCloseTo(1 / 30)
  })

  it('multiplica o dt pela velocidade e trava depois de uma pausa longa', () => {
    const { loop, r, state } = setup({ speed: 2 })
    loop.start()
    r.frame(0)
    r.frame(40)
    r.frame(10_000)
    expect(state().steps[1]).toBeCloseTo(0.08)
    expect(state().steps[2]).toBe(MAX_DT)
  })

  it('cada quadro limpa e desenha isolado em save/restore', () => {
    const { loop, r, ctx } = setup()
    loop.start()
    r.frame(0)
    expect(ctx.calls).toEqual(['clearRect', 'save', 'restore'])
  })

  it('stop cancela o rAF; start de novo não acumula laços', () => {
    const { loop, r } = setup()
    loop.start()
    loop.start()
    expect(r.pending()).toBe(true)
    loop.stop()
    expect(r.caf).toHaveBeenCalledTimes(1)
    expect(r.pending()).toBe(false)
    loop.stop()
    expect(r.caf).toHaveBeenCalledTimes(1)
  })

  it('resize recria o estado no tamanho novo', () => {
    const { loop, inits } = setup()
    loop.resize(280, 520)
    expect(inits).toEqual([
      [300, 400],
      [280, 520]
    ])
  })

  it('renderStill avança ~1,5 s em passos fixos e desenha uma vez', () => {
    const { loop, r, state } = setup()
    loop.renderStill()
    expect(state().steps).toHaveLength(45)
    expect(state().steps.every((dt) => Math.abs(dt - 1 / 30) < 1e-9)).toBe(true)
    expect(state().draws).toBe(1)
    expect(r.pending()).toBe(false)
  })
})

describe('passo depois do desenho', () => {
  const P: EffectParams = { density: 1, speed: 2, color: '#ffffff' }

  it('roda depois da cena, com a área e o tempo do efeito', () => {
    const { scene } = spyScene()
    const { raf, caf, frame } = fakeRaf()
    const post = vi.fn()
    const loop = createEffectLoop({
      scene: scene as Scene,
      params: P,
      ctx: fakeCtx(),
      width: 300,
      height: 400,
      rand: seededRand(1),
      raf,
      caf,
      post
    })
    loop.start()
    frame(0)
    frame(50)
    const [w, h, t] = post.mock.calls[post.mock.calls.length - 1]
    expect([w, h]).toEqual([300, 400])
    // 50 ms na velocidade 2.
    expect(t).toBeCloseTo(0.1)
  })

  it('o quadro parado (menos movimento) também recebe', () => {
    const { scene } = spyScene()
    const { raf, caf } = fakeRaf()
    const post = vi.fn()
    createEffectLoop({
      scene: scene as Scene,
      params: P,
      ctx: fakeCtx(),
      width: 300,
      height: 400,
      rand: seededRand(1),
      raf,
      caf,
      post
    }).renderStill()
    expect(post).toHaveBeenCalledTimes(1)
  })
})
