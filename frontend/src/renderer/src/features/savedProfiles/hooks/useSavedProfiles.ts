import { useEffect, useState } from 'react'
import { useAuthStore, type User } from '../../auth/store/authStore'
import {
  applyStep,
  canSaveMore,
  currentSavedProfileId,
  type SavedProfile
} from '../lib/savedProfiles'
import { useSavedProfilesStore } from '../store/savedProfilesStore'

export interface SavedProfilesView {
  user: User | null
  items: SavedProfile[]
  loaded: boolean
  busy: string | null
  /** O perfil salvo igual ao de agora ("Em uso"), ou null. */
  currentId: string | null
  canSave: boolean
  /** Aplicar que espera confirmação (o perfil de agora não está salvo). */
  pendingApply: SavedProfile | null
  /** Aplica na hora, ou pede confirmação se o perfil de agora se perderia. */
  choose: (item: SavedProfile) => void
  confirmApply: () => Promise<void>
  cancelApply: () => void
  save: (name: string) => Promise<boolean>
  rename: (id: string, name: string) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  update: (id: string) => Promise<boolean>
}

/** Perfis salvos da tela Perfis: carrega ao abrir e decide quando confirmar. */
export function useSavedProfiles(): SavedProfilesView {
  const user = useAuthStore((s) => s.user)
  const { items, loaded, busy, load, save, rename, remove, update, apply } = useSavedProfilesStore()
  const [pendingApply, setPendingApply] = useState<SavedProfile | null>(null)
  const userId = user?.id

  useEffect(() => {
    if (userId) void load()
  }, [userId, load])

  const currentId = currentSavedProfileId(items, user)

  const choose = (item: SavedProfile): void => {
    const step = applyStep(item.id, currentId, busy !== null)
    if (step === 'confirm') setPendingApply(item)
    else if (step === 'apply') void apply(item.id)
  }

  const confirmApply = async (): Promise<void> => {
    if (pendingApply) await apply(pendingApply.id)
    setPendingApply(null)
  }

  return {
    user,
    items,
    loaded,
    busy,
    currentId,
    canSave: canSaveMore(items),
    pendingApply,
    choose,
    confirmApply,
    cancelApply: () => setPendingApply(null),
    save,
    rename,
    remove,
    update
  }
}
