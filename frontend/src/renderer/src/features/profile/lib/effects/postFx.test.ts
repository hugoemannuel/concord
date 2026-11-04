import { describe, expect, it, vi } from 'vitest'
import { createPostFx, tintStops, type PostCtx } from './postFx'
import { fakeCtx } from './fakeCtx'

const canvas = {} as HTMLCanvasElement
const spec = { palette: 'single', color: '#ff0000', color2: '#0000ff', glow: 0 } as const

function scratch(): { el: HTMLCanvasElement; ctx: ReturnType<typeof fakeCtx> } {
  const ctx = fakeCtx()
  return {
    ctx,
    el: { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement
  }
}

const main = (): PostCtx & ReturnType<typeof fakeCtx> =>
  fakeCtx() as unknown as PostCtx & ReturnType<typeof fakeCtx>

describe('tintStops', () => {
  it('duas cores: da principal à segunda', () => {
    expect(tintStops('duo', '#ff0000', '#0000ff', 0)).toEqual([
      [0, '#ff0000'],
      [1, '#0000ff']
    ])
  })
  it('arco-íris: várias paradas e anda com o tempo', () => {
    const a = tintStops('rainbow', '#ff0000', '#0000ff', 0)
    expect(a.length).toBeGreaterThanOrEqual(6)
    expect(a[0][0]).toBe(0)
    expect(a[a.length - 1][0]).toBe(1)
    expect(tintStops('rainbow', '#ff0000', '#0000ff', 3)[0][1]).not.toBe(a[0][1])
  })
  it('cor única: sem pintura', () => {
    expect(tintStops('single', '#ff0000', '#0000ff', 0)).toEqual([])
  })
})

describe('createPostFx', () => {
  it('cor única e sem brilho: nenhum passo a mais (tema salvo desenha igual)', () => {
    const make = vi.fn()
    expect(createPostFx(main(), canvas, spec, make)).toBeNull()
    expect(make).not.toHaveBeenCalled()
  })

  it('mistura: pinta só o que já foi desenhado e restaura o contexto', () => {
    const ctx = main()
    const post = createPostFx(ctx, canvas, { ...spec, palette: 'duo' }, () => null)!
    let during = ''
    const fill = ctx.fillRect
    ctx.fillRect = (...a: Parameters<typeof fill>) => {
      during = ctx.globalCompositeOperation
      fill(...a)
    }
    post(300, 400, 0)
    expect(during).toBe('source-atop')
    expect(ctx.calls).toEqual(['save', 'createLinearGradient', 'globalAlpha', 'fillRect', 'restore'])
    expect(ctx.bad).toEqual([])
  })

  it('brilho: reduz numa tela pequena e soma por cima', () => {
    const ctx = main()
    const small = scratch()
    const post = createPostFx(ctx, canvas, { ...spec, glow: 0.5 }, () => small.el)!
    post(300, 400, 0)
    expect(small.el.width).toBeLessThanOrEqual(60)
    expect(small.el.height).toBeLessThanOrEqual(80)
    expect(small.ctx.calls).toContain('drawImage')
    expect(ctx.calls.filter((c) => c === 'drawImage').length).toBeGreaterThan(0)
    expect(ctx.bad).toEqual([])
  })

  it('a tela pequena só muda de tamanho quando o efeito muda', () => {
    const small = scratch()
    let writes = 0
    let width = 0
    Object.defineProperty(small.el, 'width', {
      get: () => width,
      set: (v: number) => {
        writes++
        width = v
      }
    })
    const post = createPostFx(main(), canvas, { ...spec, glow: 1 }, () => small.el)!
    post(300, 400, 0)
    post(300, 400, 0.1)
    expect(writes).toBe(1)
    post(600, 400, 0.2)
    expect(writes).toBe(2)
  })

  it('sem como criar a tela pequena: desenha sem o brilho, sem quebrar', () => {
    const ctx = main()
    const post = createPostFx(ctx, canvas, { ...spec, glow: 1 }, () => null)!
    expect(() => post(300, 400, 0)).not.toThrow()
    expect(ctx.calls).not.toContain('drawImage')
  })
})
