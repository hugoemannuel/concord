import { describe, expect, it } from 'vitest'
import { tileDims, tileFillStyle, tileFrameClass, tileRing, tileRootAttrs } from './tileFrame'

describe('tileFrame', () => {
  it('tamanhos', () => {
    expect(tileDims('fill')).toContain('max-w-full')
    expect(tileDims('lg')).toBe('h-48 w-80')
    expect(tileDims('md')).toBe('h-28 w-44')
  })

  it('só o fill calcula a largura pela proporção', () => {
    expect(tileFillStyle('lg', 2)).toBeUndefined()
    expect(tileFillStyle('fill', 2)).toEqual({
      aspectRatio: '2',
      width: 'min(100cqw, calc(100cqh * 2))'
    })
  })

  it('anel verde na transmissão ou em quem fala', () => {
    expect(tileRing(true, false)).toContain('ring-success')
    expect(tileRing(false, true)).toContain('ring-success')
    expect(tileRing(false, false)).toBe('ring-1 ring-fg/6')
  })

  it('tela cheia: fundo preto, sem anel nem cursor', () => {
    const cls = tileFrameClass({
      size: 'lg',
      inFullscreen: true,
      isScreen: true,
      active: true,
      clickable: true
    })
    expect(cls).toBe('bg-black')
  })

  it('clicável ganha cursor e brilho', () => {
    const base = { size: 'md', inFullscreen: false, isScreen: false, active: false } as const
    expect(tileFrameClass({ ...base, clickable: true })).toContain('cursor-pointer')
    expect(tileFrameClass({ ...base, clickable: false })).not.toContain('cursor-pointer')
  })
})

describe('tileRootAttrs', () => {
  it('clicável vira botão; na transmissão sugere expandir; Maestro é marcado', () => {
    expect(tileRootAttrs(true, true, false)).toEqual({
      role: 'button',
      title: 'Expandir tela',
      'data-maestro-tile': undefined
    })
    expect(tileRootAttrs(true, false, true)).toEqual({
      role: 'button',
      title: undefined,
      'data-maestro-tile': ''
    })
    expect(tileRootAttrs(false, true, false).role).toBeUndefined()
  })
})
