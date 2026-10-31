import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: (select: (s: object) => unknown) => select({ user: { id: 'me' } })
}))
vi.mock('./CallAvatar', () => ({
  default: (p: { size: number; className: string }) => (
    <div data-avatar={p.size} data-class={p.className} />
  )
}))
vi.mock('../../music/components/MaestroAvatar', () => ({ default: () => <div data-maestro="" /> }))
vi.mock('../../levels/components/LevelUpBurst', () => ({ default: () => <div data-burst="" /> }))

import TileAvatar from './TileAvatar'

const ana = { id: 'u1', username: 'ana', display_name: 'Ana' }
const render = (p: Partial<Parameters<typeof TileAvatar>[0]> = {}): string =>
  renderToStaticMarkup(<TileAvatar user={ana} big active={false} isScreen={false} {...p} />)

describe('TileAvatar', () => {
  it('tamanho grande 96, médio 56', () => {
    expect(render()).toContain('data-avatar="96"')
    expect(render({ big: false })).toContain('data-avatar="56"')
  })

  it('quem fala ganha o anel verde', () => {
    expect(render({ active: true })).toContain('ring-4 ring-success')
    expect(render()).not.toContain('ring-4')
  })

  it('o burst de nível é só para os outros, nunca na transmissão', () => {
    expect(render()).toContain('data-burst')
    expect(render({ user: { ...ana, id: 'me' } })).not.toContain('data-burst')
    expect(render({ isScreen: true })).not.toContain('data-burst')
  })

  it('mostra a ação abaixo do avatar', () => {
    expect(render({ action: <button>Assistir</button> })).toContain('Assistir')
  })
})
