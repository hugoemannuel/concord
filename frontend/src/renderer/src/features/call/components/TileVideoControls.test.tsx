import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('./StreamAudioControls', () => ({
  default: (p: { userId?: string; onToggleFullscreen?: () => void }) => (
    <div data-bar={p.userId ?? ''} data-fs={p.onToggleFullscreen ? 'sim' : 'nao'} />
  )
}))
vi.mock('./FullscreenOverlay', () => ({ default: () => <div data-overlay="" /> }))

import TileVideoControls from './TileVideoControls'

const user = { id: 'u1', username: 'ana', display_name: 'Ana' }
const render = (p: Partial<Parameters<typeof TileVideoControls>[0]>): string =>
  renderToStaticMarkup(
    <TileVideoControls
      inFullscreen={false}
      user={user}
      canFullscreen={false}
      toggleFullscreen={() => {}}
      {...p}
    />
  )

describe('TileVideoControls', () => {
  it('em tela cheia mostra a barra da tela cheia', () => {
    expect(render({ inFullscreen: true, canFullscreen: true })).toContain('data-overlay')
  })

  it('sem volume nem tela cheia não mostra nada (câmera da tela local)', () => {
    expect(render({})).toBe('')
  })

  it('live de outra pessoa: barra com volume', () => {
    const html = render({ streamAudioUserId: 'u1' })
    expect(html).toContain('data-bar="u1"')
    expect(html).toContain('data-fs="nao"')
  })

  it('com tela cheia possível a barra leva o botão', () => {
    expect(render({ canFullscreen: true })).toContain('data-fs="sim"')
  })
})
