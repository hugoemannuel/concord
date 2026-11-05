import { create } from 'zustand'

export type FriendsTab = 'online' | 'all' | 'pending' | 'blocked' | 'add'

const CALL_CONTROLS_KEY = 'concord:call-controls-hidden'

// Lembrado neste computador; sem armazenamento disponível, começa visível.
function loadCallControlsHidden(): boolean {
  try {
    return localStorage.getItem(CALL_CONTROLS_KEY) === '1'
  } catch {
    return false
  }
}

interface UIState {
  friendsTab: FriendsTab
  setFriendsTab: (tab: FriendsTab) => void
  serverInviteModalOpen: boolean
  openServerInviteModal: () => void
  closeServerInviteModal: () => void
  /** Barra de controles da chamada (mutar, câmera…) oculta. */
  callControlsHidden: boolean
  toggleCallControls: () => void
  quickSwitcherOpen: boolean
  setQuickSwitcherOpen: (open: boolean) => void
  shortcutsModalOpen: boolean
  setShortcutsModalOpen: (open: boolean) => void
  /** Contador que o ChatPane observa: cada Ctrl+Shift+U soma 1. */
  filePickerRequest: number
  requestFilePicker: () => void
}

export const useUIStore = create<UIState>()((set) => ({
  friendsTab: 'online',
  setFriendsTab: (friendsTab) => set({ friendsTab }),
  serverInviteModalOpen: false,
  openServerInviteModal: () => set({ serverInviteModalOpen: true }),
  closeServerInviteModal: () => set({ serverInviteModalOpen: false }),
  callControlsHidden: loadCallControlsHidden(),
  toggleCallControls: () =>
    set((state) => {
      const callControlsHidden = !state.callControlsHidden
      try {
        localStorage.setItem(CALL_CONTROLS_KEY, callControlsHidden ? '1' : '0')
      } catch {
        // Sem armazenamento: vale só até fechar o app.
      }
      return { callControlsHidden }
    }),
  quickSwitcherOpen: false,
  setQuickSwitcherOpen: (quickSwitcherOpen) => set({ quickSwitcherOpen }),
  shortcutsModalOpen: false,
  setShortcutsModalOpen: (shortcutsModalOpen) => set({ shortcutsModalOpen }),
  filePickerRequest: 0,
  requestFilePicker: () => set((state) => ({ filePickerRequest: state.filePickerRequest + 1 }))
}))
