import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedProfilesView } from '../hooks/useSavedProfiles'
import type { SavedProfile } from '../lib/savedProfiles'

const state = vi.hoisted(() => ({ view: null as unknown as SavedProfilesView }))
vi.mock('../hooks/useSavedProfiles', () => ({ useSavedProfiles: () => state.view }))
vi.mock('../../../shared/ui/Avatar', () => ({ default: () => <span data-avatar /> }))

import { renderToStaticMarkup } from 'react-dom/server'
import SavedProfilesPanel from './SavedProfilesPanel'

const item = (id: string, name: string): SavedProfile => ({
  id,
  name,
  fields: { display_name: 'Ana' },
  avatar_url: null,
  banner_url: null,
  created_at: '',
  updated_at: ''
})

const view = (over: Partial<SavedProfilesView> = {}): SavedProfilesView => ({
  user: {
    id: 'u1',
    username: 'ana',
    display_name: 'Ana',
    email: '',
    created_at: '',
    updated_at: ''
  },
  items: [],
  loaded: true,
  busy: null,
  currentId: null,
  canSave: true,
  pendingApply: null,
  choose: vi.fn(),
  confirmApply: vi.fn(),
  cancelApply: vi.fn(),
  save: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  ...over
})

const render = (): string => renderToStaticMarkup(<SavedProfilesPanel />)

beforeEach(() => {
  state.view = view()
})

describe('SavedProfilesPanel', () => {
  it('sem conta não desenha nada', () => {
    state.view = view({ user: null })
    expect(render()).toBe('')
  })

  it('vazio: convida a salvar o perfil atual', () => {
    const html = render()
    expect(html).toContain('Perfis salvos')
    expect(html).toContain('(0/10)')
    expect(html).toContain('Nenhum perfil salvo ainda.')
    expect(html).toContain('Salvar perfil atual')
  })

  it('lista com o que está em uso marcado e as ações sempre à mostra', () => {
    state.view = view({ items: [item('a', 'Casual'), item('b', 'Gamer')], currentId: 'a' })
    const html = render()
    expect(html).toContain('aria-label="Casual (em uso)"')
    expect(html).toContain('Em uso')
    expect(html).toContain('aria-label="Usar o perfil Gamer"')
    expect(html).toContain('aria-label="Renomear Gamer"')
    expect(html).toContain('aria-label="Excluir Gamer"')
    expect(html).toContain('aria-label="Atualizar Gamer com o perfil atual"')
  })

  it('o perfil em uso já é igual ao atual: atualizar fica travado', () => {
    state.view = view({ items: [item('a', 'Casual'), item('b', 'Gamer')], currentId: 'a' })
    const html = render()
    expect(html).toMatch(/aria-label="Atualizar Casual com o perfil atual"[^>]*disabled=""/)
    expect(html).not.toMatch(/aria-label="Atualizar Gamer com o perfil atual"[^>]*disabled=""/)
  })

  it('no limite, o botão de salvar trava e explica', () => {
    state.view = view({ canSave: false })
    const html = render()
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*title="Exclua um perfil salvo para salvar outro."/
    )
  })

  it('salvando mostra o andamento', () => {
    state.view = view({ busy: 'new' })
    expect(render()).toContain('Salvando…')
  })
})
