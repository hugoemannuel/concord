import { describe, expect, it, vi } from 'vitest'

vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../../chat/store/chatStore', () => ({ usePresenceStatus: () => 'online' }))
vi.mock('../../profile/store/profileStore', () => ({
  useUserLook: (_id: string, fallback: { name: string; nameplateUrl?: string | null }) => ({
    name: fallback.name,
    nameplateUrl: fallback.nameplateUrl ?? null
  })
}))
vi.mock('../../profile/store/userMenuStore', () => ({ useUserMenuStore: { getState: () => ({}) } }))
vi.mock('../../profile/components/StyledName', () => ({
  default: ({ name }: { name: string }) => <b>{name}</b>
}))
vi.mock('../../activity/components/ActivityLine', () => ({ CompactActivityLine: () => <i>jogo</i> }))
vi.mock('../../../shared/ui/Avatar', () => ({ default: () => <u data-avatar /> }))
vi.mock('./GroupIcon', () => ({ default: () => <u data-group-icon /> }))
vi.mock('../../profile/components/Nameplate', () => ({
  default: ({ url }: { url: string | null }) => (url ? <i data-nameplate={url} /> : null)
}))

import { renderToStaticMarkup } from 'react-dom/server'
import type { ConversationSummary } from '../../chat/api/conversations'
import ConversationRow from './ConversationRow'

const dm = {
  id: 'c1',
  type: 'dm',
  name: '',
  other_user: { id: 'u2', username: 'ana', display_name: 'Ana Souza' }
} as unknown as ConversationSummary
const group = {
  id: 'g1',
  type: 'group',
  name: 'Os amigos',
  members: [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
} as unknown as ConversationSummary

function render(
  conv: ConversationSummary,
  over: Partial<React.ComponentProps<typeof ConversationRow>> = {}
): string {
  return renderToStaticMarkup(
    <ConversationRow
      conv={conv}
      active={false}
      unread={0}
      typing={false}
      meId="me"
      onClose={() => {}}
      {...over}
    />
  )
}

describe('ConversationRow', () => {
  it('DM com faixa: a faixa da outra pessoa atrás da linha', () => {
    const withPlate = {
      ...dm,
      other_user: { ...dm.other_user, nameplate_url: '/api/profile-media/n' }
    } as ConversationSummary
    expect(render(withPlate)).toContain('data-nameplate="/api/profile-media/n"')
    expect(render(dm)).not.toContain('data-nameplate')
  })

  it('grupo não tem faixa', () => {
    expect(render(group)).not.toContain('data-nameplate')
  })

  it('DM: avatar e nome da outra pessoa, e o botão de fechar a DM', () => {
    const html = render(dm)
    expect(html).toContain('data-avatar')
    expect(html).toContain('Ana Souza')
    expect(html).toContain('jogo')
    expect(html).toContain('aria-label="Fechar DM"')
  })

  it('grupo: ícone do grupo, título, quantos membros e o botão de sair', () => {
    const html = render(group)
    expect(html).toContain('data-group-icon')
    expect(html).toContain('Os amigos')
    expect(html).toContain('3 membros')
    expect(html).toContain('aria-label="Sair do grupo"')
  })

  it('DM sem a outra pessoa conhecida cai no ícone da conversa', () => {
    const html = render({ ...dm, other_user: undefined } as ConversationSummary)
    expect(html).toContain('data-group-icon')
    expect(html).not.toContain('data-avatar')
  })

  it('digitando troca a linha de baixo', () => {
    const html = render(group, { typing: true })
    expect(html).toContain('digitando…')
    expect(html).not.toContain('3 membros')
  })

  it('não lidas: contagem (99+ acima de 99) e título em destaque; sem não lidas, sem contagem', () => {
    expect(render(dm, { unread: 5 })).toMatch(/>5</)
    expect(render(dm, { unread: 150 })).toContain('99+')
    expect(render(dm, { unread: 5 })).toContain('font-semibold')
    expect(render(dm)).not.toContain('bg-danger-strong px-1.5')
  })

  it('a conversa aberta fica marcada', () => {
    expect(render(dm, { active: true })).toContain('bg-fg/10')
    expect(render(dm)).not.toContain('bg-fg/10')
  })

  it('o botão de fechar não some do toque nem do teclado (antes era display:none até o hover)', () => {
    const button = /<button[^>]*aria-label="Fechar DM"[^>]*>/.exec(render(dm))?.[0] ?? ''
    expect(button).not.toBe('')
    expect(button.split(/[\s"]+/)).not.toContain('hidden')
    expect(button).toContain('[@media(hover:hover)]:sr-only')
    expect(button).toContain('focus-visible:not-sr-only')
  })

  it('a contagem de não lidas só some no hover real (no toque ela fica ao lado do X)', () => {
    expect(render(dm, { unread: 3 })).toContain('[@media(hover:hover)]:group-hover:hidden')
  })
})
