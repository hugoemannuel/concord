import { beforeEach, describe, expect, it, vi } from 'vitest'

// No render de servidor o zustand devolve o estado inicial; os mocks deixam
// cada teste escolher o usuário.
const state = vi.hoisted(() => ({
  auth: {
    user: null as Record<string, unknown> | null,
    setUser: vi.fn()
  }
}))
vi.mock('../../../auth/store/authStore', () => ({
  useAuthStore: Object.assign((sel: (s: typeof state.auth) => unknown) => sel(state.auth), {
    getState: () => state.auth
  })
}))

vi.mock('../../../profile/store/meActions', () => ({ changeMyStatus: vi.fn() }))
vi.mock('../../../profile/components/EntranceSoundSettings', () => ({ default: () => null }))
vi.mock('../../../../shared/ui/Avatar', () => ({ default: () => <span data-avatar /> }))
// O corpo do cartão puxa a atividade (e a call); aqui basta o que a prévia recebe.
vi.mock('../../../profile/components/ProfileCardBody', () => ({
  default: ({
    profile
  }: {
    profile: { display_name: string; links: string[]; avatar_decoration_url?: string | null }
  }) => (
    <div data-preview={profile.display_name} data-decoration={profile.avatar_decoration_url ?? ''}>
      {profile.links.join(' ')}
    </div>
  )
}))

import { renderToStaticMarkup } from 'react-dom/server'
import ProfilesSection from './ProfilesSection'

const render = (): string => renderToStaticMarkup(<ProfilesSection />)

beforeEach(() => {
  state.auth.user = {
    id: 'u1',
    username: 'ana',
    display_name: 'Ana',
    email: 'a@x.com',
    bio: 'oi',
    links: [{ url: 'https://github.com/ana' }],
    banner_color: '#112233',
    avatar_url: '/a.png',
    avatar_decoration_url: '/api/profile-media/d',
    banner_url: '/b.png',
    status: 'online'
  }
})

describe('ProfilesSection', () => {
  it('sem usuário não desenha nada', () => {
    state.auth.user = null
    expect(render()).toBe('')
  })

  it('o cartão grande e a coluna de blocos, sem abas nem formulário, repassando a moldura na prévia', () => {
    const html = render()
    expect(html).toContain('Como os outros veem')
    expect(html).toContain('data-preview="Ana"')
    expect(html).toContain('data-decoration="/api/profile-media/d"')
    expect(html).toContain('aria-label="Personalizar perfil"')
    expect(html).toContain('qualquer parte do cartão')
    // Nada do editor antigo: abas, campos soltos e a barra de alterações.
    expect(html).not.toContain('role="tablist"')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('alterações não salvas')
    expect(html).not.toContain('Aniversário')
  })

  it('um bloco para cada coisa editável', () => {
    const html = render()
    for (const title of [
      'Avatar e banner',
      'Cor do banner',
      'Tema do perfil',
      'Nome de exibição',
      'Pronomes',
      'Nota',
      'Sobre mim',
      'Links',
      'Status',
      'Som de entrada'
    ]) {
      expect(html).toContain(`>${title}</h3>`)
    }
    expect(html).toContain('aria-label="Alterar avatar"')
    expect(html).toContain('aria-label="Alterar banner"')
    expect(html).toContain('aria-label="Mudar a cor do banner"')
    expect(html).toContain('aria-label="Mudar o tema do perfil"')
    expect(html).toContain('aria-label="Editar nome de exibição e estilo"')
    expect(html).toContain('aria-label="Mudar status de presença"')
  })

  it('os blocos resumem o que está salvo e convidam no vazio', () => {
    const html = render()
    expect(html).toContain('#112233')
    expect(html).toContain('Padrão · Sólido')
    expect(html).toContain('1 link')
    expect(html).toContain('Adicionar pronomes')
    expect(html).toContain('No que você está pensando?')
    expect(html).toContain('Som padrão')
  })

  it('com avatar e banner: os "Remover"', () => {
    const html = render()
    expect(html).toContain('Remover avatar')
    expect(html).toContain('Remover banner')
  })

  it('no topo, os perfis salvos para trocar o perfil inteiro', () => {
    const html = render()
    expect(html).toContain('Perfis salvos')
    expect(html).toContain('Salvar perfil atual')
    expect(html.indexOf('Perfis salvos')).toBeLessThan(html.indexOf('Como os outros veem'))
  })

  it('mostra o status atual, inclusive invisível', () => {
    state.auth.user = { ...state.auth.user, status: 'invisible' }
    const html = render()
    expect(html).toContain('Invisível')
  })

  it('nenhum modal começa aberto', () => {
    expect(render()).not.toContain('role="dialog"')
  })

  it('sem avatar, banner nem cor: sem os "Remover" e a cor fica "Padrão"', () => {
    state.auth.user = { ...state.auth.user, avatar_url: null, banner_url: null, banner_color: null }
    const html = render()
    expect(html).not.toContain('Remover avatar')
    expect(html).not.toContain('Remover banner')
    expect(html).toContain('>Padrão</span>')
  })
})
