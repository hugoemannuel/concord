import { useAuthStore } from '../../auth/store/authStore'
import { refreshTheme } from '../../settings/store/themeStore'
import { useCustomThemesStore } from '../store/customThemesStore'
import { CUSTOM_THEMES_STORAGE_KEY, customThemeKey, type CustomTheme } from './customThemes'
import { API_BASE_URL } from '../../../shared/lib/config'
import { customThemesCss } from './themeCss'
import { imageOrigin } from './themeImage'
import { SAVED_THEMES_STYLE, writeStyleSheet } from './themeStyleSheet'

/** As imagens de fundo vêm do servidor (no web, da mesma origem). */
const IMAGE_ORIGIN = imageOrigin(API_BASE_URL)

function writeThemes(themes: CustomTheme[]): void {
  const entries = themes.map((t) => ({ key: customThemeKey(t.id), input: t }))
  writeStyleSheet(SAVED_THEMES_STYLE, customThemesCss(entries, IMAGE_ORIGIN))
}

/** Entrou ou trocou de conta: traz os temas dela. Ao sair, a cópia local fica. */
export function syncThemesWithAccount(userId: string | undefined, previous: string | undefined): void {
  if (userId && userId !== previous) void useCustomThemesStore.getState().load()
}

function onStorage(e: StorageEvent): void {
  if (e.key === CUSTOM_THEMES_STORAGE_KEY) useCustomThemesStore.getState().rehydrate()
}

/**
 * Temas próprios: escreve o CSS deles (antes do startThemeSync, para o app
 * abrir com as cores certas), reescreve quando a lista muda, acompanha outras
 * janelas e, com `account`, carrega da conta a cada login. O overlay usa
 * `account: false` (lê a cópia local que o app mantém).
 */
export function startCustomThemes({ account = true }: { account?: boolean } = {}): () => void {
  writeThemes(useCustomThemesStore.getState().themes)
  const offThemes = useCustomThemesStore.subscribe((next, prev) => {
    if (next.themes === prev.themes) return
    writeThemes(next.themes)
    refreshTheme()
  })
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  let offAuth = (): void => {}
  if (account) {
    syncThemesWithAccount(useAuthStore.getState().user?.id, undefined)
    offAuth = useAuthStore.subscribe((next, prev) => syncThemesWithAccount(next.user?.id, prev.user?.id))
  }
  return () => {
    offThemes()
    offAuth()
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}
