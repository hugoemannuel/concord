import { create } from 'zustand'
import { customThemeKey } from '../../appearance/lib/customThemes'
import { schemeOf } from '../../appearance/lib/palette'
import { useCustomThemesStore } from '../../appearance/store/customThemesStore'
import {
  DEFAULT_THEME,
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  THEMES,
  type AppliedTheme,
  type CustomThemeKey,
  type ThemePreference
} from '../lib/themes'

// Tema de cor (Configurações → Aparência). A escolha fica neste computador
// (localStorage), como as outras preferências locais; o tema em vigor vai no
// data-theme do <html>, que o assets/theme.css lê (e o <style> dos temas
// próprios, ver features/appearance). data-scheme diz se ele é claro ou escuro.

const DARK_QUERY = '(prefers-color-scheme: dark)'

function loadPreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

function savePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    // Sem armazenamento: vale só até fechar o app.
  }
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches
  } catch {
    return true
  }
}

function findCustom(key: string): { background: string } | undefined {
  return useCustomThemesStore.getState().themes.find((t) => customThemeKey(t.id) === key)
}

const hasCustom = (key: CustomThemeKey): boolean => findCustom(key) !== undefined

function resolve(pref: ThemePreference): AppliedTheme {
  return resolveTheme(pref, systemPrefersDark(), hasCustom)
}

function schemeFor(theme: AppliedTheme): 'dark' | 'light' {
  const custom = findCustom(theme)
  if (custom) return schemeOf(custom.background)
  return THEMES.find((t) => t.id === theme)?.scheme ?? 'dark'
}

/**
 * Liga o tema no documento: atributos, cor da aba (web) e barra nativa
 * (desktop). `force` repinta mesmo sem trocar (tema próprio editado).
 */
function applyTheme(theme: AppliedTheme, paintTitleBar: boolean, force = false): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (root.dataset.theme === theme && !force) return
  root.dataset.theme = theme
  root.dataset.scheme = schemeFor(theme)
  const style = getComputedStyle(root)
  const bg = style.getPropertyValue('--bg-app').trim()
  const symbols = style.getPropertyValue('--interactive-normal').trim()
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  if (paintTitleBar) window.api?.windowTheme?.setTitleBarColors({ color: bg, symbolColor: symbols })
}

interface ThemeState {
  /** O que o usuário escolheu (pode ser "system" ou um tema próprio). */
  preference: ThemePreference
  /** O tema em vigor agora. */
  theme: AppliedTheme
  setPreference: (pref: ThemePreference) => void
}

let paintTitleBar = true

export const useThemeStore = create<ThemeState>()((set) => {
  const preference = loadPreference()
  return {
    preference,
    theme: resolve(preference),
    setPreference: (pref) => {
      savePreference(pref)
      const theme = resolve(pref)
      applyTheme(theme, paintTitleBar)
      set({ preference: pref, theme })
    }
  }
})

function refresh(pref: ThemePreference, force = false): void {
  const theme = resolve(pref)
  applyTheme(theme, paintTitleBar, force)
  useThemeStore.setState({ preference: pref, theme })
}

/**
 * Reaplica a escolha atual: a lista de temas próprios mudou (carregou da conta,
 * foi editada ou apagada). Repinta a barra mesmo que o tema seja o mesmo.
 */
export function refreshTheme(): void {
  refresh(useThemeStore.getState().preference, true)
}

let started = false

/**
 * Aplica o tema salvo antes do primeiro render (sem piscar o padrão) e passa a
 * acompanhar o sistema e as outras janelas (o overlay e o app dividem o
 * localStorage). `titleBar: false` no overlay, que não tem barra.
 */
export function startThemeSync({ titleBar = true }: { titleBar?: boolean } = {}): void {
  paintTitleBar = titleBar
  refresh(useThemeStore.getState().preference)
  if (started || typeof window === 'undefined') return
  started = true

  try {
    window.matchMedia(DARK_QUERY).addEventListener('change', () => {
      const { preference } = useThemeStore.getState()
      if (preference === 'system') refresh(preference)
    })
  } catch {
    // Sem matchMedia: "Seguir o sistema" fica no escuro.
  }

  window.addEventListener('storage', (e) => {
    if (e.key === THEME_STORAGE_KEY) refresh(parseThemePreference(e.newValue))
  })
}
