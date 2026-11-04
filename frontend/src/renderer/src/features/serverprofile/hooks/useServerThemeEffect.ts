import { useEffect, useMemo } from 'react'
import { API_BASE_URL } from '../../../shared/lib/config'
import { customThemesCss } from '../../appearance/lib/themeCss'
import { imageOrigin } from '../../appearance/lib/themeImage'
import { schemeOf } from '../../appearance/lib/palette'
import { writeStyleSheet } from '../../appearance/lib/themeStyleSheet'
import { selectDraft, useThemeEditorStore } from '../../appearance/store/themeEditorStore'
import { setThemePreview } from '../../settings/store/themeStore'
import { useSettingsStore } from '../../settings/store/settingsStore'
import { serverThemeInput } from '../lib/serverThemeInput'
import { useServerThemePrefStore } from '../store/serverThemePrefStore'
import { useServerProfile } from './useServerProfile'

const SERVER_THEME_STYLE = 'salinha-server-theme'
const SERVER_THEME_KEY = 'custom-server'
const IMAGE_ORIGIN = imageOrigin(API_BASE_URL)

/**
 * Enquanto a pessoa está no servidor, o app mostra o fundo dele pelo mesmo
 * mecanismo da prévia do editor de tema. Cede a vez ao editor e às Configurações
 * (lá a pessoa precisa ver o tema dela) e respeita quem desligou.
 */
export function useServerThemeEffect(serverId: string | undefined): void {
  const profile = useServerProfile(serverId)
  const enabled = useServerThemePrefStore((s) => s.enabled)
  const editing = useThemeEditorStore((s) => selectDraft(s) !== null)
  const inSettings = useSettingsStore((s) => s.open)
  const theme = profile?.theme
  const input = useMemo(() => serverThemeInput(theme), [theme])
  const show = enabled && !editing && !inSettings ? input : null

  useEffect(() => {
    if (!show) return
    writeStyleSheet(SERVER_THEME_STYLE, customThemesCss([{ key: SERVER_THEME_KEY, input: show }], IMAGE_ORIGIN))
    setThemePreview({ key: SERVER_THEME_KEY, scheme: schemeOf(show.background) })
    return () => {
      setThemePreview(null)
      writeStyleSheet(SERVER_THEME_STYLE, '')
    }
  }, [show])
}
