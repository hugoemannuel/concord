import { create } from 'zustand'
import { getAppThemes, saveAppThemes } from '../api/appThemes'
import {
  CUSTOM_THEMES_STORAGE_KEY,
  normalizeCustomThemes,
  upsertTheme,
  type CustomTheme
} from '../lib/customThemes'

/**
 * Temas próprios (Configurações → Aparência). A lista fica na conta (vale em
 * todo aparelho) e numa cópia local, para o app abrir com as cores certas antes
 * de carregar e para o overlay, que divide o localStorage. Qual tema está em uso
 * continua sendo escolha de cada computador (settings/store/themeStore).
 */
interface CustomThemesState {
  themes: CustomTheme[]
  saving: boolean
  error: string | null
  load: () => Promise<void>
  /** Cria ou troca um tema; false se não deu para salvar na conta. */
  save: (theme: CustomTheme) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  /** Relê a cópia local (outra janela mudou). */
  rehydrate: () => void
}

export const SAVE_ERROR = 'Não foi possível salvar na sua conta. O tema ficou só neste computador; tente de novo.'

function readCache(): CustomTheme[] {
  try {
    return normalizeCustomThemes(JSON.parse(localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY) ?? '[]'))
  } catch {
    return []
  }
}

function writeCache(themes: CustomTheme[]): void {
  try {
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes))
  } catch {
    // Sem armazenamento: vale só até fechar o app.
  }
}

export const useCustomThemesStore = create<CustomThemesState>()((set, get) => {
  const apply = (themes: CustomTheme[]): void => {
    writeCache(themes)
    set({ themes })
  }

  const push = async (themes: CustomTheme[]): Promise<boolean> => {
    apply(themes)
    set({ saving: true, error: null })
    try {
      const res = await saveAppThemes(themes)
      apply(normalizeCustomThemes(res.themes))
      return true
    } catch {
      set({ error: SAVE_ERROR })
      return false
    } finally {
      set({ saving: false })
    }
  }

  return {
    themes: readCache(),
    saving: false,
    error: null,

    load: async () => {
      try {
        apply(normalizeCustomThemes((await getAppThemes()).themes))
      } catch {
        // Sem rede: fica a cópia local.
      }
    },

    save: (theme) => push(upsertTheme(get().themes, theme)),

    remove: (id) => push(get().themes.filter((t) => t.id !== id)),

    rehydrate: () => set({ themes: readCache() })
  }
})
