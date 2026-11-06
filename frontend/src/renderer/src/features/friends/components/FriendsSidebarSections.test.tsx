import { describe, expect, it, vi } from 'vitest'

vi.mock('./ConversationRow', () => ({
  default: (p: { conv: { id: string }; active: boolean; unread: number; typing: boolean }) => (
    <li data-active={p.active} data-unread={p.unread} data-typing={p.typing}>
      {p.conv.id}
    </li>
  )
}))
vi.mock('./ConfirmModal', () => ({
  default: (p: {
    open: boolean
    title: string
    confirmLabel: string
    children: React.ReactNode
  }) =>
    p.open ? (
      <section>
        <h2>{p.title}</h2>
        <button>{p.confirmLabel}</button>
        {p.children}
      </section>
    ) : null
}))
vi.mock('../../../shared/ui/skeleton/layouts', () => ({
  DmListSkeleton: () => <p>skeleton-dms</p>
}))

import { renderToStaticMarkup } from 'react-dom/server'
import type { ConversationSummary } from '../../chat/api/conversations'
import { DirectMessagesList, FriendsNavButton, LeaveGroupConfirm } from './FriendsSidebarSections'

const conv = (id: string): ConversationSummary =>
  ({ id, type: 'group', name: `Grupo ${id}`, members: [] }) as unknown as ConversationSummary

describe('FriendsNavButton', () => {
  it('destacado na página de amigos, com o contador de pedidos', () => {
    const html = renderToStaticMarkup(
      <FriendsNavButton pathname="/friends" incomingCount={3} onOpen={() => {}} />
    )
    expect(html).toContain('bg-fg/10 text-strong')
    expect(html).toContain('>3</span>')
  })

  it('fora da página e sem pedidos: sem destaque nem contador', () => {
    const html = renderToStaticMarkup(
      <FriendsNavButton pathname="/dm/u1" incomingCount={0} onOpen={() => {}} />
    )
    expect(html).toContain('text-gray-400 hover:bg-fg/6')
    expect(html).not.toContain('bg-danger-strong')
  })

  it('a raiz também é a página de amigos', () => {
    expect(
      renderToStaticMarkup(<FriendsNavButton pathname="/" incomingCount={0} onOpen={() => {}} />)
    ).toContain('bg-fg/10 text-strong')
  })
})

describe('DirectMessagesList', () => {
  const base = {
    unreadByRoom: { 'conversation:c1': 2 },
    typingDms: ['conversation:c2'],
    meId: 'me',
    isActive: (c: ConversationSummary) => c.id === 'c2',
    onCreate: () => {},
    onClose: () => {}
  }

  it('carregando sem conversas: esqueleto', () => {
    const html = renderToStaticMarkup(
      <DirectMessagesList {...base} conversations={[]} loaded={false} />
    )
    expect(html).toContain('skeleton-dms')
    expect(html).not.toContain('Nenhuma conversa ainda.')
  })

  it('carregado sem conversas: aviso', () => {
    const html = renderToStaticMarkup(<DirectMessagesList {...base} conversations={[]} loaded />)
    expect(html).toContain('Nenhuma conversa ainda.')
    expect(html).not.toContain('skeleton-dms')
  })

  it('lista as conversas com aberta, não lidas e digitando', () => {
    const html = renderToStaticMarkup(
      <DirectMessagesList {...base} conversations={[conv('c1'), conv('c2')]} loaded />
    )
    expect(html).toContain('Mensagens diretas')
    expect(html).toContain('aria-label="Criar DM"')
    expect(html).toContain('<li data-active="false" data-unread="2" data-typing="false">c1</li>')
    expect(html).toContain('<li data-active="true" data-unread="0" data-typing="true">c2</li>')
  })
})

describe('LeaveGroupConfirm', () => {
  const props = { meId: 'me', onClose: () => {}, onConfirm: async () => {} }

  it('fechado sem grupo escolhido', () => {
    expect(renderToStaticMarkup(<LeaveGroupConfirm {...props} leaving={null} />)).toBe('')
  })

  it('com o nome do grupo no título', () => {
    const html = renderToStaticMarkup(<LeaveGroupConfirm {...props} leaving={conv('g1')} />)
    expect(html).toContain('Sair de &#x27;Grupo g1&#x27;')
    expect(html).toContain('Sair do grupo')
    expect(html).toContain('Você só volta se alguém te adicionar de novo.')
  })
})
