import { create } from 'zustand'
import type { Channel, ChannelType } from '../api/channels'

/** Formulário de criar (editing = null) ou editar canal. */
export interface ChannelForm {
  editing: Channel | null
  type: ChannelType
  categoryId?: string
  /** Muda a cada abertura: o formulário nasce limpo (ou com o nome do canal editado). */
  session: number
}

/**
 * O que está aberto na barra de canais: o menu "•••" de um canal e os
 * diálogos (criar/editar, apagar canal, permissões, sair/apagar servidor).
 */
interface ChannelSidebarState {
  menuFor: string | null
  form: ChannelForm | null
  deleting: Channel | null
  permissionsFor: Channel | null
  confirm: 'leave' | 'delete-server' | null
  /** Abre o menu deste canal ou fecha se já está aberto. */
  toggleMenu: (channelId: string) => void
  openMenu: (channelId: string) => void
  closeMenu: () => void
  openCreate: (type: ChannelType, categoryId?: string) => void
  openEdit: (channel: Channel) => void
  closeForm: () => void
  askDelete: (channel: Channel) => void
  cancelDelete: () => void
  openPermissions: (channel: Channel) => void
  closePermissions: () => void
  openConfirm: (kind: 'leave' | 'delete-server') => void
  closeConfirm: () => void
}

let session = 0

export const useChannelSidebarStore = create<ChannelSidebarState>((set, get) => ({
  menuFor: null,
  form: null,
  deleting: null,
  permissionsFor: null,
  confirm: null,
  toggleMenu: (channelId) => set({ menuFor: get().menuFor === channelId ? null : channelId }),
  openMenu: (channelId) => set({ menuFor: channelId }),
  closeMenu: () => set({ menuFor: null }),
  openCreate: (type, categoryId) => set({ form: { editing: null, type, categoryId, session: ++session } }),
  openEdit: (channel) =>
    set({ menuFor: null, form: { editing: channel, type: channel.type, session: ++session } }),
  closeForm: () => set({ form: null }),
  askDelete: (channel) => set({ menuFor: null, deleting: channel }),
  cancelDelete: () => set({ deleting: null }),
  openPermissions: (channel) => set({ menuFor: null, permissionsFor: channel }),
  closePermissions: () => set({ permissionsFor: null }),
  openConfirm: (kind) => set({ confirm: kind }),
  closeConfirm: () => set({ confirm: null })
}))
