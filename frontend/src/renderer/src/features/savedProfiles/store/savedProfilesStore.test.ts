import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listSavedProfiles: vi.fn(),
  createSavedProfile: vi.fn(),
  renameSavedProfile: vi.fn(),
  deleteSavedProfile: vi.fn(),
  updateSavedProfile: vi.fn(),
  applySavedProfile: vi.fn()
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('../api/savedProfiles', () => api)
vi.mock('../../../shared/store/toastStore', () => ({ showToast: toast }))

import { ApiError } from '../../../shared/api/client'
import { useAuthStore, type User } from '../../auth/store/authStore'
import type { SavedProfile } from '../lib/savedProfiles'
import { useSavedProfilesStore } from './savedProfilesStore'

const me: User = {
  id: 'eu',
  username: 'eu',
  display_name: 'Eu',
  email: 'e@x.com',
  status: 'idle',
  created_at: '',
  updated_at: ''
}
const item = (id: string, name: string): SavedProfile => ({
  id,
  name,
  fields: { display_name: 'Eu' },
  avatar_url: null,
  banner_url: null,
  created_at: '',
  updated_at: ''
})
const store = (): ReturnType<typeof useSavedProfilesStore.getState> =>
  useSavedProfilesStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: me })
  useSavedProfilesStore.setState({ ownerId: 'eu', items: [], loaded: false, busy: null })
})

describe('savedProfilesStore', () => {
  it('carrega a lista da conta logada', async () => {
    api.listSavedProfiles.mockResolvedValue([item('a', 'A')])
    await store().load()
    expect(store()).toMatchObject({ loaded: true, items: [item('a', 'A')] })
  })

  it('outra conta: limpa a lista antiga antes de carregar', async () => {
    useSavedProfilesStore.setState({ ownerId: 'outra', items: [item('x', 'X')], loaded: true })
    let seen: SavedProfile[] | null = null
    api.listSavedProfiles.mockImplementation(async () => {
      seen = store().items
      return []
    })
    await store().load()
    expect(seen).toEqual([])
    expect(store().ownerId).toBe('eu')
  })

  it('erro ao carregar vira toast', async () => {
    api.listSavedProfiles.mockRejectedValue(new ApiError(500, 'internal error'))
    await store().load()
    expect(toast.error).toHaveBeenCalledWith('Não deu para carregar os perfis salvos.')
    expect(store().loaded).toBe(false)
  })

  it('salvar acrescenta e avisa', async () => {
    api.createSavedProfile.mockResolvedValue(item('a', 'Gamer'))
    expect(await store().save('  Gamer ')).toBe(true)
    expect(api.createSavedProfile).toHaveBeenCalledWith('Gamer')
    expect(store().items.map((s) => s.name)).toEqual(['Gamer'])
    expect(toast.success).toHaveBeenCalledWith('Perfil "Gamer" salvo.')
    expect(store().busy).toBeNull()
  })

  it('recusa do servidor aparece como veio', async () => {
    api.createSavedProfile.mockRejectedValue(
      new ApiError(409, 'Já existe um perfil salvo com esse nome')
    )
    expect(await store().save('A')).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('Já existe um perfil salvo com esse nome')
  })

  it('renomear e excluir', async () => {
    useSavedProfilesStore.setState({ items: [item('a', 'A'), item('b', 'B')] })
    api.renameSavedProfile.mockResolvedValue(item('a', 'Novo'))
    expect(await store().rename('a', ' Novo ')).toBe(true)
    expect(api.renameSavedProfile).toHaveBeenCalledWith('a', 'Novo')
    api.deleteSavedProfile.mockResolvedValue(undefined)
    expect(await store().remove('b')).toBe(true)
    expect(store().items.map((s) => s.name)).toEqual(['Novo'])
  })

  it('aplicar troca a conta (mantendo o status da sessão) e avisa', async () => {
    useSavedProfilesStore.setState({ items: [item('a', 'Casual')] })
    api.applySavedProfile.mockResolvedValue({ ...me, display_name: 'Outro', status: 'online' })
    expect(await store().apply('a')).toBe(true)
    expect(useAuthStore.getState().user).toMatchObject({ display_name: 'Outro', status: 'idle' })
    expect(toast.success).toHaveBeenCalledWith('Perfil "Casual" aplicado.')
  })

  it('uma ação por vez', async () => {
    useSavedProfilesStore.setState({ busy: 'a' })
    expect(await store().apply('a')).toBe(false)
    expect(api.applySavedProfile).not.toHaveBeenCalled()
  })

  it('atualizar com o perfil atual troca o item mantendo nome e avisa', async () => {
    useSavedProfilesStore.setState({ items: [item('a', 'Casual'), item('b', 'B')] })
    api.updateSavedProfile.mockResolvedValue({ ...item('a', 'Casual'), avatar_url: '/novo' })
    expect(await store().update('a')).toBe(true)
    expect(api.updateSavedProfile).toHaveBeenCalledWith('a')
    expect(store().items.map((s) => s.name)).toEqual(['Casual', 'B'])
    expect(store().items[0].avatar_url).toBe('/novo')
    expect(toast.success).toHaveBeenCalledWith('Perfil "Casual" atualizado.')
  })

  it('atualizar com erro mostra o toast e não mexe na lista', async () => {
    useSavedProfilesStore.setState({ items: [item('a', 'Casual')] })
    api.updateSavedProfile.mockRejectedValue(new ApiError(404, 'Perfil salvo não encontrado'))
    expect(await store().update('a')).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('Perfil salvo não encontrado')
    expect(store().items).toEqual([item('a', 'Casual')])
  })

  describe('sync (aviso de outro aparelho)', () => {
    it('com a lista já aberta, recarrega sem toast', async () => {
      useSavedProfilesStore.setState({ items: [item('a', 'A')], loaded: true })
      api.listSavedProfiles.mockResolvedValue([item('a', 'A'), item('b', 'Nova')])
      await store().sync()
      expect(store().items.map((s) => s.name)).toEqual(['A', 'Nova'])
      expect(toast.error).not.toHaveBeenCalled()
    })

    it('lista nunca aberta: não busca (abrir a tela já carrega)', async () => {
      await store().sync()
      expect(api.listSavedProfiles).not.toHaveBeenCalled()
    })

    it('falha de rede é silenciosa e mantém a lista', async () => {
      useSavedProfilesStore.setState({ items: [item('a', 'A')], loaded: true })
      api.listSavedProfiles.mockRejectedValue(new Error('rede'))
      await store().sync()
      expect(store().items).toEqual([item('a', 'A')])
      expect(toast.error).not.toHaveBeenCalled()
    })

    it('troca de conta no meio do pedido descarta a resposta', async () => {
      useSavedProfilesStore.setState({ items: [], loaded: true })
      api.listSavedProfiles.mockImplementation(async () => {
        useAuthStore.setState({ user: { ...me, id: 'outra' } })
        return [item('x', 'X')]
      })
      await store().sync()
      expect(store().items).toEqual([])
    })
  })
})
