import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('./VoiceStateIcons', () => ({ default: () => <i data-voice="" /> }))
vi.mock('../../profile/components/StyledName', () => ({
  default: (p: { name: string }) => <>{p.name}</>
}))
vi.mock('./ConnectionQualityBars', () => ({ default: () => <i data-quality="" /> }))
vi.mock('./CallActivityBadge', () => ({ default: () => <i data-activity="" /> }))

import TileNameplate from './TileNameplate'

const voice = { muted: false, deafened: false, serverMuted: false, serverDeafened: false }
const ana = { id: 'u1', username: 'ana', display_name: 'Ana' }
const render = (p: Partial<Parameters<typeof TileNameplate>[0]> = {}): string =>
  renderToStaticMarkup(
    <TileNameplate user={ana} isScreen={false} locallyMuted={false} voice={voice} {...p} />
  )

describe('TileNameplate', () => {
  it('participante: nome, atividade e qualidade da conexão', () => {
    const html = render()
    expect(html).toContain('Ana')
    expect(html).toContain('data-activity')
    expect(html).toContain('data-quality')
  })

  it('transmissão não mostra atividade nem qualidade', () => {
    const html = render({ isScreen: true })
    expect(html).not.toContain('data-activity')
    expect(html).not.toContain('data-quality')
  })

  it('silenciado por você mostra o aviso', () => {
    expect(render({ locallyMuted: true })).toContain('Silenciado por você')
    expect(render()).not.toContain('Silenciado por você')
  })
})
