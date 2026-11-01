import { useMemo } from 'react'
import { useCustomThemesStore } from '../../appearance/store/customThemesStore'
import { useThemeStore } from '../../settings/store/themeStore'
import { readOverlayTheme, rgbToHex, type OverlayTheme } from '../lib/overlayTheme'

let canvas: CanvasRenderingContext2D | null | undefined

/**
 * Qualquer cor do CSS (hex, rgb, oklch…) → "#rrggbb", pintando um pixel: o
 * navegador converte do jeito que pinta a tela. Sem canvas, null.
 */
function cssColorToHex(cssColor: string): string | null {
  if (canvas === undefined) {
    canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  }
  if (!canvas) return null
  canvas.clearRect(0, 0, 1, 1)
  canvas.fillStyle = '#000'
  canvas.fillStyle = cssColor
  canvas.fillRect(0, 0, 1, 1)
  const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data
  return rgbToHex(r, g, b)
}

/**
 * Cores do tema em vigor para o overlay nativo; recalcula ao trocar de tema ou
 * quando a lista de temas próprios muda (o tema em uso pode ter sido editado).
 */
export function useOverlayTheme(): Partial<OverlayTheme> | null {
  const theme = useThemeStore((s) => s.theme)
  // Só como gatilho do useMemo: as cores vêm do CSS, que já foi reescrito.
  const customThemes = useCustomThemesStore((s) => s.themes)
  return useMemo(() => {
    if (typeof document === 'undefined' || !theme) return null
    const style = getComputedStyle(document.documentElement)
    return readOverlayTheme((name) => style.getPropertyValue(name), cssColorToHex)
  }, [theme, customThemes])
}
