import { create } from 'zustand'
import { useSettingsStore } from '../../settings/store/settingsStore'

// Qual perfil Configurações → Perfis está editando: o global (null) ou o de um
// servidor. Fechar as configurações volta ao global.

interface ProfileEditorScopeState {
  serverId: string | null
  setServerId: (serverId: string | null) => void
}

export const useProfileEditorScopeStore = create<ProfileEditorScopeState>()((set) => ({
  serverId: null,
  setServerId: (serverId) => set({ serverId })
}))

/** O atalho "Editar perfil do servidor" (menu do servidor e cartão). */
export function openMemberProfileEditor(serverId: string): void {
  useProfileEditorScopeStore.getState().setServerId(serverId)
  useSettingsStore.getState().openSettings('profiles')
}
