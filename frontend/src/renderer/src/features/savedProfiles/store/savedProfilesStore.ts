import { create } from 'zustand'
import { useAuthStore } from '../../auth/store/authStore'
import { commitMe } from '../../auth/store/accountActions'
import { showToast } from '../../../shared/store/toastStore'
import {
  applySavedProfile,
  createSavedProfile,
  deleteSavedProfile,
  listSavedProfiles,
  renameSavedProfile,
  updateSavedProfile
} from '../api/savedProfiles'
import {
  SAVING_NEW,
  removeSaved,
  replaceSaved,
  savedProfileError,
  type SavedProfile
} from '../lib/savedProfiles'

interface SavedProfilesState {
  /** De quem é a lista (outra conta logada recomeça do zero). */
  ownerId: string | null
  items: SavedProfile[]
  loaded: boolean
  /** SAVING_NEW ou o id do perfil salvo em andamento; null = livre. */
  busy: string | null
  load: () => Promise<void>
  /** Aviso de outro aparelho: recarrega a lista já aberta, sem toast. */
  sync: () => Promise<void>
  /** As ações devolvem true se deu certo (o modal fecha); erro vira toast. */
  save: (name: string) => Promise<boolean>
  rename: (id: string, name: string) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  /** Sobrescreve o perfil salvo com o perfil atual (nome e posição ficam). */
  update: (id: string) => Promise<boolean>
  apply: (id: string) => Promise<boolean>
}

const nameOf = (items: SavedProfile[], id: string): string =>
  items.find((s) => s.id === id)?.name ?? 'Perfil'

/**
 * Perfis salvos (Configurações → Perfis): a lista vem do servidor ao abrir a
 * tela; cada ação grava na hora. Aplicar troca o perfil da conta (authStore)
 * e o servidor avisa os outros, como qualquer edição do perfil.
 */
export const useSavedProfilesStore = create<SavedProfilesState>()((set, get) => {
  const run = async (
    busy: string,
    fallback: string,
    call: () => Promise<void>
  ): Promise<boolean> => {
    if (get().busy) return false
    set({ busy })
    try {
      await call()
      return true
    } catch (err) {
      showToast.error(savedProfileError(err, fallback))
      return false
    } finally {
      set({ busy: null })
    }
  }

  return {
    ownerId: null,
    items: [],
    loaded: false,
    busy: null,

    load: async () => {
      const ownerId = useAuthStore.getState().user?.id ?? null
      if (ownerId !== get().ownerId) set({ ownerId, items: [], loaded: false })
      try {
        const items = await listSavedProfiles()
        if (useAuthStore.getState().user?.id === ownerId) set({ items, loaded: true })
      } catch (err) {
        showToast.error(savedProfileError(err, 'Não deu para carregar os perfis salvos.'))
      }
    },

    sync: async () => {
      const { ownerId, loaded } = get()
      if (!loaded || ownerId !== (useAuthStore.getState().user?.id ?? null)) return
      try {
        const items = await listSavedProfiles()
        if (useAuthStore.getState().user?.id === ownerId) set({ items })
      } catch {
        // Sem rede agora: a lista continua como está e o próximo aviso tenta de novo.
      }
    },

    save: (name) =>
      run(SAVING_NEW, 'Não deu para salvar o perfil.', async () => {
        const saved = await createSavedProfile(name.trim())
        set({ items: replaceSaved(get().items, saved) })
        showToast.success(`Perfil "${saved.name}" salvo.`)
      }),

    rename: (id, name) =>
      run(id, 'Não deu para renomear o perfil.', async () => {
        set({ items: replaceSaved(get().items, await renameSavedProfile(id, name.trim())) })
      }),

    remove: (id) =>
      run(id, 'Não deu para excluir o perfil.', async () => {
        await deleteSavedProfile(id)
        set({ items: removeSaved(get().items, id) })
      }),

    update: (id) =>
      run(id, 'Não deu para atualizar o perfil.', async () => {
        const saved = await updateSavedProfile(id)
        set({ items: replaceSaved(get().items, saved) })
        showToast.success(`Perfil "${saved.name}" atualizado.`)
      }),

    apply: (id) =>
      run(id, 'Não deu para aplicar o perfil.', async () => {
        commitMe(await applySavedProfile(id))
        showToast.success(`Perfil "${nameOf(get().items, id)}" aplicado.`)
      })
  }
})
