import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SoundBadge from './SoundBadge'

describe('SoundBadge', () => {
  it('mostra o emoji e o nome do som', () => {
    const html = renderToStaticMarkup(
      <SoundBadge userId="u1" sound={{ emoji: '🎺', soundName: 'Buzina' }} />
    )
    expect(html).toContain('soundboard-badge-u1')
    expect(html).toContain('🎺')
    expect(html).toContain('Buzina')
  })

  it('sem emoji usa o alto-falante', () => {
    const html = renderToStaticMarkup(<SoundBadge userId="u1" sound={{ soundName: 'x' }} />)
    expect(html).toContain('🔊')
  })
})
