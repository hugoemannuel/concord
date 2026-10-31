import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const fs = vi.hoisted(() => ({ active: false }))
vi.mock('../store/soundboardStore', () => ({
  useSoundboardStore: (select: (s: object) => unknown) =>
    select({ activePlays: { u1: { soundName: 'Buzina', emoji: null } } })
}))
vi.mock('../../music/store/musicStore', () => ({
  useMusicStore: (select: (s: object) => unknown) => select({ togglePanel: () => {} })
}))
vi.mock('../hooks/useStreamFullscreen', () => ({
  useStreamFullscreen: () => ({ ref: { current: null }, active: fs.active, toggle: () => {} })
}))
vi.mock('./LevelGlow', () => ({ default: () => null }))
vi.mock('./ScreenAnnotations', () => ({ default: () => <i data-annotations="" /> }))
vi.mock('./ScreenTileOverlays', () => ({ default: () => <i data-overlays="" /> }))
vi.mock('./TileAvatar', () => ({ default: () => <i data-avatar="" /> }))
vi.mock('./TileNameplate', () => ({ default: () => <i data-nameplate="" /> }))
vi.mock('./TileVideo', () => ({ default: () => <i data-video="" /> }))
vi.mock('./TileVideoControls', () => ({ default: () => <i data-controls="" /> }))

import ParticipantTile from './ParticipantTile'

const ana = { id: 'u1', username: 'ana', display_name: 'Ana' }
const stream = {} as MediaStream

describe('ParticipantTile', () => {
  beforeEach(() => {
    fs.active = false
  })

  it('transmissão sem vídeo: avatar, nome e camada de desenho, sem controles de vídeo', () => {
    const html = renderToStaticMarkup(<ParticipantTile user={ana} isScreen />)
    expect(html).toContain('data-avatar')
    expect(html).toContain('data-nameplate')
    expect(html).toContain('data-annotations')
    expect(html).not.toContain('data-controls')
  })

  it('com vídeo: sem avatar, com os controles do vídeo; clicável vira botão', () => {
    const html = renderToStaticMarkup(
      <ParticipantTile user={ana} videoStream={stream} onClick={() => {}} />
    )
    expect(html).not.toContain('data-avatar')
    expect(html).toContain('data-controls')
    expect(html).toContain('role="button"')
    expect(html).toContain('group/tile')
  })

  it('câmera mostra o som que está tocando; transmissão não', () => {
    expect(renderToStaticMarkup(<ParticipantTile user={ana} />)).toContain('Buzina')
    expect(renderToStaticMarkup(<ParticipantTile user={ana} isScreen />)).not.toContain('Buzina')
  })

  it('em tela cheia some o chrome do tile (chips e nome)', () => {
    fs.active = true
    const html = renderToStaticMarkup(<ParticipantTile user={ana} videoStream={stream} />)
    expect(html).not.toContain('data-overlays')
    expect(html).not.toContain('data-nameplate')
    expect(html).toContain('bg-black')
  })

  it('tile fill calcula a largura pela proporção do vídeo', () => {
    const html = renderToStaticMarkup(<ParticipantTile user={ana} size="fill" videoStream={stream} />)
    expect(html).toContain('aspect-ratio')
  })
})
