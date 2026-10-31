import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { EventGoing } from '../api/events'
import GoingPeople from './GoingPeople'

const people: EventGoing[] = [
  { user_id: 'u1', username: 'ana', display_name: 'Ana' },
  { user_id: 'u2', username: 'bia', display_name: '' }
]
const playing = { u1: 'Minecraft', u2: 'Valorant' }

function render(props: Partial<React.ComponentProps<typeof GoingPeople>> = {}): string {
  return renderToStaticMarkup(
    <GoingPeople people={people} game="Minecraft" running playing={playing} {...props} />
  )
}

describe('GoingPeople', () => {
  it('lista quem vai, com o nome de exibição ou o usuário', () => {
    const html = render({ running: false })
    expect(html).toContain('Ana')
    expect(html).toContain('bia')
  })

  it('em andamento, o selo "Jogando" aparece só em quem joga o jogo do evento', () => {
    const html = render()
    expect(html.match(/Jogando/g)).toHaveLength(1)
    expect(html).toMatch(/Ana[\s\S]*Jogando/)
  })

  it('compara sem acento e sem diferença de maiúsculas', () => {
    expect(render({ game: 'MINECRAFT' })).toContain('Jogando')
  })

  it('sem o evento em andamento, ninguém tem selo', () => {
    expect(render({ running: false })).not.toContain('Jogando')
  })

  it('evento sem jogo, ninguém tem selo', () => {
    expect(render({ game: null })).not.toContain('Jogando')
  })

  it('atividade diferente do jogo, ninguém tem selo', () => {
    expect(render({ playing: { u1: 'Valorant' } })).not.toContain('Jogando')
  })

  it('sem ninguém, não renderiza nada', () => {
    expect(render({ people: [] })).toBe('')
  })
})
