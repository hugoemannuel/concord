import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  preview: { status: 'loading' } as unknown,
  me: { id: 'u', username: 'ana', display_name: 'Ana', email: 'a@ex.com' } as Record<string, unknown> | null,
  code: 'ABC' as string | null,
  join: {} as Record<string, unknown>
}))

vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  createPortal: (children: unknown) => children
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../hooks/useInvitePreview', () => ({ useInvitePreview: () => state.preview }))
vi.mock('../hooks/useInviteJoin', () => ({ useInviteJoin: () => state.join }))
vi.mock('../../serverprofile/hooks/useServerCard', () => ({ useInviteCard: () => ({ status: 'loading' }) }))
vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: state.me })
}))
vi.mock('../store/inviteLinkStore', () => ({
  useInviteLinkStore: (select: (s: unknown) => unknown) => select({ code: state.code, close: vi.fn() })
}))
vi.mock('../store/serverStore', () => ({
  useServerStore: (select: (s: unknown) => unknown) => select({ servers: [{ id: 'já' }] })
}))
vi.mock('../../../shared/ui/Avatar', () => ({ default: () => null }))

vi.stubGlobal('document', { body: {} })

import { renderToStaticMarkup } from 'react-dom/server'
import InviteConfirmModal from './InviteConfirmModal'

const preview = { name: 'Salinha', member_count: 2, online_count: 1, server_id: 's', is_member: false }
const ready = (over = {}): unknown => ({ status: 'ready', preview: { ...preview, ...over } })
const render = (): string => renderToStaticMarkup(<InviteConfirmModal />)

beforeEach(() => {
  state.preview = ready()
  state.code = 'ABC'
  state.me = { id: 'u', username: 'ana', display_name: 'Ana', email: 'a@ex.com' }
  state.join = {}
})

describe('confirmação do convite', () => {
  it('sem convite aberto, nada', () => {
    state.code = null
    expect(render()).toBe('')
  })

  it('carregando e indisponível', () => {
    state.preview = { status: 'loading' }
    expect(render()).toContain('aria-label="Convite"')
    state.preview = { status: 'error', message: 'Expirou.' }
    const html = render()
    expect(html).toContain('Convite indisponível')
    expect(html).toContain('Expirou.')
  })

  it('aceitar com o nome da pessoa', () => {
    const html = render()
    expect(html).toContain('Aceitar como Ana')
    expect(html).toContain('Não, obrigado')
    state.join = { joining: true }
    expect(render()).toContain('Entrando...')
  })

  it('já é membro: abrir o servidor (pelo servidor ou pela lista local)', () => {
    state.preview = ready({ is_member: true })
    expect(render()).toContain('Abrir servidor')
    state.preview = ready({ is_member: undefined, server_id: 'já' })
    expect(render()).toContain('Você já está neste servidor')
  })

  it('banido: só fechar, sem o aceitar', () => {
    state.join = { banned: true, joinError: 'Você foi banido deste servidor.' }
    const html = render()
    expect(html).toContain('Você foi banido')
    expect(html).not.toContain('Aceitar como')
  })

  it('e-mail sem confirmar: pede para confirmar', () => {
    state.me = { ...state.me, email_verified: false }
    state.join = { notice: 'Enviamos um novo e-mail.' }
    const html = render()
    expect(html).toContain('Confirme seu e-mail (a@ex.com)')
    expect(html).toContain('Reenviar e-mail')
    expect(html).toContain('Enviamos um novo e-mail.')
    state.join = { checking: true }
    expect(render()).toContain('Conferindo...')
  })
})
