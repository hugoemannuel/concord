import { useMemo, type CSSProperties } from 'react'
import EffectLayer from '../../profile/components/EffectLayer'
import { useThemeStore } from '../../settings/store/themeStore'
import { activeTheme, backdropFx } from '../lib/themeBackdrop'
import { EFFECT_PEAK } from '../lib/paletteSurfaces'
import { useCustomThemesStore } from '../store/customThemesStore'
import { selectDraft, useThemeEditorStore } from '../store/themeEditorStore'

/**
 * Efeito animado no fundo do app (tema próprio com "Efeitos"): atrás de todo o
 * conteúdo (os painéis ficam translúcidos para ele aparecer), sem clique e com
 * a opacidade que a paleta usa para garantir o contraste. O motor é o do
 * cartão de perfil: pausa com a janela oculta ou minimizada e fica parado com
 * prefers-reduced-motion. Montado só na janela principal (App).
 */
export function ThemeBackdrop(): React.JSX.Element | null {
  const draft = useThemeEditorStore(selectDraft)
  const theme = useThemeStore((s) => s.theme)
  const themes = useCustomThemesStore((s) => s.themes)
  const fx = useMemo(() => backdropFx(activeTheme(draft, theme, themes)), [draft, theme, themes])
  if (!fx) return null
  const style = { opacity: EFFECT_PEAK, '--pt-fxc': fx.params.color } as CSSProperties
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={style}>
      <EffectLayer fx={fx} />
    </div>
  )
}
