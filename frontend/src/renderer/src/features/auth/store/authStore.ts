import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AUTH_STORAGE_KEY } from '../lib/authRefresh'
import type { ChosenStatus } from '../../friends/lib/presenceStatus'
import type { NameStyle } from '../../profile/lib/nameStyle'
import type { ProfileTheme } from '../../profile/lib/profileTheme'
import type { NameplateMode } from '../../profile/lib/cosmetics'

export interface ProfileLink {
  url: string
}

/**
 * Outra pessoa (busca, amigos, eventos): o backend nunca manda o e-mail de
 * ninguém além do da própria conta.
 */
export interface PublicUser {
  id: string
  username: string
  display_name: string
  avatar_url?: string | null
  // Perfil (Configurações → Perfis). Opcionais: listas de amigos e sessões
  // salvas antes do perfil existir não trazem.
  banner_url?: string | null
  banner_color?: string | null
  /** Som que toca na call quando a pessoa entra (ausente = o padrão). */
  entrance_sound_url?: string | null
  pronouns?: string
  bio?: string
  status_text?: string
  links?: ProfileLink[]
  status?: ChosenStatus
  /** Fonte e efeito do nome de exibição (ausente = padrão). */
  name_style?: NameStyle
  /** Borda, fundo e efeito do cartão de perfil (ausente = padrão). */
  profile_theme?: ProfileTheme
  /** Faixa efetiva (o banner ou a imagem própria; ausente = sem faixa). */
  nameplate_url?: string | null
  /** Moldura do avatar (ausente = sem moldura). */
  avatar_decoration_url?: string | null
  created_at: string
  updated_at: string
}

/** A própria conta (/users/me e /users/me/*): com o e-mail. */
export interface User extends PublicUser {
  email: string
  /** false até a pessoa abrir o link do e-mail de confirmação. */
  email_verified?: boolean
  /** Quando dá para trocar o @ de novo (uma vez a cada 7 dias; ausente = nunca trocou). */
  username_change_available_at?: string | null
  /** Faixa: desligada, o banner ou a imagem própria (nameplate_custom_url). */
  nameplate_mode?: NameplateMode
  /** A imagem própria da faixa guardada (mesmo com o modo em "banner"). */
  nameplate_custom_url?: string | null
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  setTokens: (accessToken: string, refreshToken: string) => void
  setUser: (user: User) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null })
    }),
    { name: AUTH_STORAGE_KEY }
  )
)

// Login, logout ou renovação em outra aba (app web): esta aba passa a usar a
// mesma sessão. O evento não dispara na própria aba (nem no Electron, que tem
// uma janela só).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === AUTH_STORAGE_KEY || event.key === null) {
      void useAuthStore.persist.rehydrate()
    }
  })
}
