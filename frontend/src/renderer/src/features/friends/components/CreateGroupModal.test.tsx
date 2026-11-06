import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  friends: [] as { id: string; username: string; display_name: string }[]
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../../../shared/ui/Modal', () => ({
  default: ({
    open,
    title,
    children
  }: {
    open: boolean
    title: string
    children: React.ReactNode
  }) =>
    open ? (
      <section>
        <h2>{title}</h2>
        {children}
      </section>
    ) : null
}))
vi.mock('../../../shared/ui/Avatar', () => ({ default: () => <u data-avatar /> }))
vi.mock('../../profile/components/StyledName', () => ({
  default: ({ name }: { name: string }) => <b>{name}</b>
}))
vi.mock('../store/friendStore', () => ({
  useFriendStore: (select: (s: unknown) => unknown) => select({ friends: state.friends })
}))
vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: { id: 'me' } })
}))
vi.mock('../../chat/store/chatStore', () => ({
  useChatStore: (select: (s: unknown) => unknown) => select({ fetchConversations: vi.fn() })
}))

import { renderToStaticMarkup } from 'react-dom/server'
import CreateGroupModal from './CreateGroupModal'

describe('CreateGroupModal', () => {
  beforeEach(() => {
    state.friends = [
      { id: 'a', username: 'ana', display_name: 'Ana' },
      { id: 'b', username: 'bia', display_name: '' }
    ]
  })

  it('novo: título, vagas, amigos (nome ou usuário) e botão desligado sem ninguém marcado', () => {
    const html = renderToStaticMarkup(<CreateGroupModal open onClose={() => {}} />)
    expect(html).toContain('Selecionar amigos')
    expect(html).toContain('Você pode adicionar mais 9 amigos.')
    expect(html).toContain('<b>Ana</b>')
    expect(html).toContain('<b>bia</b>')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Criar DM<\/button>/)
  })

  it('grupo existente: título de adicionar e some quem já está', () => {
    const html = renderToStaticMarkup(
      <CreateGroupModal open groupId="g1" existingIds={['me', 'a']} onClose={() => {}} />
    )
    expect(html).toContain('Adicionar amigos ao grupo')
    expect(html).toContain('Você pode adicionar mais 8 amigos.')
    expect(html).not.toContain('<b>Ana</b>')
    expect(html).toContain('>Adicionar</button>')
  })

  it('sem amigos para mostrar', () => {
    state.friends = []
    expect(renderToStaticMarkup(<CreateGroupModal open onClose={() => {}} />)).toContain(
      'Nenhum amigo encontrado.'
    )
  })
})
