import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../shared/ui/Modal', () => ({
  default: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div role="dialog" data-title={title}>
      {children}
    </div>
  )
}))
vi.mock('../../../../shared/ui/Avatar', () => ({ default: () => <span data-avatar /> }))
vi.mock('../../../profile/components/StyledName', () => ({
  default: ({ name }: { name: string }) => <b>{name}</b>
}))
vi.mock('../../../profile/components/ProfileCardBody', () => ({ default: () => <div data-card /> }))
vi.mock('../../../auth/store/accountActions', () => ({ changeMyEmail: vi.fn(), changeMyUsername: vi.fn() }))
vi.mock('../../../profile/store/myProfileActions', () => ({ saveMyProfileFields: vi.fn() }))
vi.mock('../../../profile/store/meActions', () => ({ endLocalSession: vi.fn(), logoutEverywhere: vi.fn() }))

// Minha conta lê a sessão e o aniversário: aqui ficam fixos.
const state = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  birthday: null as Record<string, unknown> | null
}))
vi.mock('../../../auth/store/authStore', () => ({
  useAuthStore: (sel: (s: { user: unknown }) => unknown) => sel({ user: state.user })
}))
vi.mock('../../store/settingsStore', () => ({
  useSettingsStore: (sel: (s: { goTo: () => void }) => unknown) => sel({ goTo: () => {} })
}))
vi.mock('../../../profile/hooks/useBirthday', () => ({
  useBirthday: () => ({ birthday: state.birthday, save: vi.fn() })
}))

import { renderToStaticMarkup } from 'react-dom/server'
import MyAccountSection from '../sections/MyAccountSection'
import AccountHeader from './AccountHeader'
import AccountModals from './AccountModals'
import { AccountRow } from './AccountRow'
import BirthdayEditModal from './BirthdayEditModal'
import CredentialModal from './CredentialModal'
import DeleteAccountModal from './DeleteAccountModal'
import LogoutAllModal from './LogoutAllModal'

const user = {
  id: 'u1',
  username: 'ana',
  display_name: 'Ana',
  email: 'ana@gmail.com',
  created_at: '2024-03-07T12:00:00Z',
  status: 'online'
}
const birthday = { day: 7, month: 3, year: 1998, announce: true }
const noop = (): void => {}

beforeEach(() => {
  state.user = { ...user }
  state.birthday = { ...birthday }
})

describe('MyAccountSection', () => {
  it('sem sessão não desenha nada', () => {
    state.user = null
    expect(renderToStaticMarkup(<MyAccountSection />)).toBe('')
  })
  it('cada dado editável tem o seu Editar; Membro desde não', () => {
    const html = renderToStaticMarkup(<MyAccountSection />)
    for (const label of ['nome de exibição', 'nome de usuário', 'e-mail', 'aniversário']) {
      expect(html).toContain(`aria-label="Editar ${label}"`)
    }
    expect(html).not.toContain('aria-label="Editar membro desde"')
    expect(html).toContain('Membro desde')
    expect(html).toContain('***@gmail.com')
    expect(html).toContain('7 de março de 1998')
    expect(html).not.toContain('role="dialog"')
  })
  it('no fim, sair de todos os dispositivos e excluir a conta (os modais só abrem no clique)', () => {
    const html = renderToStaticMarkup(<MyAccountSection />)
    expect(html).toContain('Sair de todos os dispositivos')
    expect(html).toContain('Excluir conta')
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('Entendo que a exclusão é definitiva')
  })
  it('aniversário carregando: sem Editar ainda', () => {
    state.birthday = null
    const html = renderToStaticMarkup(<MyAccountSection />)
    expect(html).toContain('Carregando…')
    expect(html).not.toContain('aria-label="Editar aniversário"')
  })
  it('sem nome de exibição mostra o @', () => {
    state.user = { ...user, display_name: '', created_at: '' }
    const html = renderToStaticMarkup(<MyAccountSection />)
    expect(html).toContain('<b>ana</b>')
  })
})

describe('AccountHeader', () => {
  it('banner com cor ou o gradiente padrão', () => {
    expect(
      renderToStaticMarkup(<AccountHeader user={{ ...user, banner_color: '#123456' } as never} onEditProfile={noop} />)
    ).toContain('#123456')
    expect(renderToStaticMarkup(<AccountHeader user={user as never} onEditProfile={noop} />)).toContain(
      'bg-gradient-brand'
    )
  })
})

describe('AccountRow', () => {
  it('sem onEdit, sem botão', () => {
    expect(renderToStaticMarkup(<AccountRow label="X" value="y" />)).not.toContain('<button')
  })
})

describe('AccountModals', () => {
  const render = (modal: Parameters<typeof AccountModals>[0]['modal'], b = state.birthday): string =>
    renderToStaticMarkup(
      <AccountModals
        modal={modal}
        user={user as never}
        birthday={{ birthday: b as never, save: vi.fn() }}
        onClose={noop}
      />
    )
  it('abre o modal de cada linha', () => {
    expect(render(null)).toBe('')
    expect(render('name')).toContain('Surpreenda-me')
    expect(render('username')).toContain('data-title="Mudar o nome de usuário"')
    expect(render('email')).toContain('data-title="Mudar o e-mail"')
    expect(render('birthday')).toContain('data-title="Aniversário"')
    expect(render('birthday', null)).toBe('')
  })
})

describe('CredentialModal', () => {
  it('o valor atual e a senha atual', () => {
    const html = renderToStaticMarkup(<CredentialModal kind="email" current="a@x.com" onClose={noop} />)
    expect(html).toContain('value="a@x.com"')
    expect(html).toContain('type="password"')
    expect(html).toContain('autoComplete="current-password"')
    expect(html).toContain('link de confirmação')
  })
})

describe('prazo do nome de usuário', () => {
  it('trocou há pouco: o modal já abre avisando e com o salvar travado', () => {
    const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
    const html = renderToStaticMarkup(
      <AccountModals
        modal="username"
        user={{ ...user, username_change_available_at: future } as never}
        birthday={{ birthday: null, save: vi.fn() }}
        onClose={noop}
      />
    )
    expect(html).toContain('Você pode trocar o nome de usuário de novo em')
    expect(html).toMatch(/type="submit" disabled=""/)
    expect(html).toMatch(/aria-label="Nome de usuário" disabled=""/)
  })
  it('prazo vencido ou nunca trocou: livre', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    for (const at of [past, undefined]) {
      const html = renderToStaticMarkup(
        <AccountModals
          modal="username"
          user={{ ...user, username_change_available_at: at } as never}
          birthday={{ birthday: null, save: vi.fn() }}
          onClose={noop}
        />
      )
      expect(html).not.toContain('de novo em')
      expect(html).not.toMatch(/type="submit" disabled=""/)
    }
  })
  it('o e-mail não tem prazo', () => {
    const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
    const html = renderToStaticMarkup(
      <AccountModals
        modal="email"
        user={{ ...user, username_change_available_at: future } as never}
        birthday={{ birthday: null, save: vi.fn() }}
        onClose={noop}
      />
    )
    expect(html).not.toContain('de novo em')
  })
})

describe('BirthdayEditModal', () => {
  it('data, anúncio e Salvar', () => {
    const html = renderToStaticMarkup(
      <BirthdayEditModal initial={birthday} onSave={vi.fn()} onClose={noop} />
    )
    expect(html).toContain('Anunciar meu aniversário nos servidores')
    expect(html).toContain('>Salvar<')
    expect(html).not.toMatch(/type="submit" disabled=""/)
  })
  it('data incompleta: aviso e Salvar travado', () => {
    const html = renderToStaticMarkup(
      <BirthdayEditModal initial={{ ...birthday, year: null }} onSave={vi.fn()} onClose={noop} />
    )
    expect(html).toContain('deixe tudo em branco')
    expect(html).toMatch(/type="submit" disabled=""/)
  })
})

describe('DeleteAccountModal', () => {
  it('explica o que fica, pede a senha e a marcação de definitiva', () => {
    const html = renderToStaticMarkup(<DeleteAccountModal onClose={() => {}} />)
    expect(html).toContain('data-title="Excluir conta"')
    expect(html).toContain('Usuário removido')
    expect(html).toContain('aria-label="Senha atual"')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('privacidade.html#excluir')
  })
})

describe('LogoutAllModal', () => {
  it('avisa que este aparelho também sai', () => {
    const html = renderToStaticMarkup(<LogoutAllModal onClose={() => {}} />)
    expect(html).toContain('data-title="Sair de todos os dispositivos"')
    expect(html).toContain('inclusive')
    expect(html).toContain('Sair de todos')
  })
})
