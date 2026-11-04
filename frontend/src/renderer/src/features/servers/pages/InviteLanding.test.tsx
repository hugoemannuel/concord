import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ preview: { status: 'loading' } as unknown, desktop: false }))

vi.mock('react-router-dom', () => ({
  Link: ({ children }: { children: unknown }) => children,
  Navigate: () => null,
  useNavigate: () => vi.fn(),
  useParams: () => ({ code: 'K7P2QX9M' })
}))
vi.mock('../../../shared/lib/config', () => ({ IS_WEB: true, API_BASE_URL: '/api' }))
vi.mock('../../../shared/lib/appLaunch', () => ({
  looksLikeDesktop: () => state.desktop,
  watchAppLaunch: vi.fn()
}))
vi.mock('../hooks/useInvitePreview', () => ({ useInvitePreview: () => state.preview }))
vi.mock('../../serverprofile/hooks/useServerCard', () => ({
  useInviteCard: () => ({
    status: 'ready',
    card: { locked: false, name: 'Salinha', member_count: 1, online_count: 0, is_member: false, profile: {
      banner: { preset: '', image: '' }, traits: [], description: 'Cantinho', games: [], private: true,
      strip: { preset: '', image: '' }, theme: { starter: '', image: '', dim: 50 }, tag: null
    } }
  })
}))

import { renderToStaticMarkup } from 'react-dom/server'
import InviteLanding from './InviteLanding'

const render = (): string => renderToStaticMarkup(<InviteLanding />)

beforeEach(() => {
  state.desktop = false
  state.preview = { status: 'loading' }
})

describe('página do link de convite', () => {
  it('computador: abrindo o app', () => {
    state.desktop = true
    expect(render()).toContain('Abrindo a Salinha')
  })

  it('convite que não vale', () => {
    state.preview = { status: 'error', message: 'Expirou.' }
    expect(render()).toContain('Convite indisponível')
  })

  it('mostra o cartão do servidor a quem tem o link, mesmo com perfil privado', () => {
    state.preview = { status: 'ready', preview: { name: 'Salinha', member_count: 1, online_count: 0 } }
    const html = render()
    expect(html).toContain('Você foi convidado(a) para entrar')
    expect(html).toContain('Cantinho')
    expect(html).toContain('Continuar no Navegador')
    expect(html).not.toContain('Servidor privado')
  })
})
