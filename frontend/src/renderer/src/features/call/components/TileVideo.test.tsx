import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('./VideoFill', () => ({
  default: (p: { fit: string; square: boolean }) => (
    <div data-fit={p.fit} data-square={String(p.square)} />
  )
}))

import TileVideo from './TileVideo'

const stream = {} as MediaStream
const render = (p: { isScreen: boolean; inFullscreen: boolean; stream?: MediaStream | null }): string =>
  renderToStaticMarkup(
    <TileVideo stream={p.stream === undefined ? stream : p.stream} mirror={false} {...p} />
  )

describe('TileVideo', () => {
  it('sem stream não renderiza', () => {
    expect(render({ isScreen: false, inFullscreen: false, stream: null })).toBe('')
  })

  it('câmera preenche; transmissão e tela cheia mostram inteiro', () => {
    expect(render({ isScreen: false, inFullscreen: false })).toContain('data-fit="cover"')
    expect(render({ isScreen: true, inFullscreen: false })).toContain('data-fit="contain"')
    const full = render({ isScreen: false, inFullscreen: true })
    expect(full).toContain('data-fit="contain"')
    expect(full).toContain('data-square="true"')
  })
})
