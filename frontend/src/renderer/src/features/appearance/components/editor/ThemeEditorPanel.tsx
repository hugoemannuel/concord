import { useEffect, useId, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useThemeEditorKeys } from '../../hooks/useThemeEditorKeys'
import { buildPalette } from '../../lib/palette'
import { useThemeEditorStore, type Draft } from '../../store/themeEditorStore'
import { BackdropGroup } from './BackdropGroup'
import { ColorsGroup } from './ColorsGroup'
import { EffectsGroup } from './EffectsGroup'
import { ImageGroup } from './ImageGroup'
import { PanelFooter } from './PanelFooter'
import { PanelHeader } from './PanelHeader'
import { ShapeGroup } from './ShapeGroup'
import { StartGroup } from './StartGroup'

// Celular: folha de baixo (o app fica visível em cima). Do md em diante: painel
// flutuante à direita, por cima das Configurações ou do app.
const PANEL =
  'app-no-drag fixed inset-x-0 bottom-0 z-[60] flex max-h-[min(60dvh,34rem)] flex-col rounded-t-xl border border-subtle bg-floating pb-safe text-normal shadow-2xl ' +
  'md:inset-x-auto md:right-4 md:bottom-4 md:w-[min(22rem,calc(100vw-2rem))] md:rounded-xl md:pb-0'
const PANEL_OPEN = 'md:top-[calc(var(--titlebar-height,0px)+1rem)] md:max-h-none'

/**
 * Editor de tema próprio em painel flutuante: cada mudança já vale no app
 * inteiro (lib/livePreview), e dá para fechar as Configurações ("Ver o app") e
 * navegar com ele aberto. Esc ou Cancelar voltam ao tema de antes.
 */
export function ThemeEditorPanel({ draft }: { draft: Draft }): React.JSX.Element {
  const collapsed = useThemeEditorStore((s) => s.collapsed)
  const update = useThemeEditorStore((s) => s.update)
  const palette = useMemo(() => buildPalette(draft), [draft])
  const ref = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  useThemeEditorKeys(ref)

  // Abriu: o foco vai para o painel (o teclado já chega nos controles).
  useEffect(() => {
    ref.current?.focus()
  }, [draft.id])

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-theme-editor=""
      className={`${PANEL} ${collapsed ? '' : PANEL_OPEN} focus-ring`}
    >
      <PanelHeader draft={draft} titleId={titleId} />
      {!collapsed && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <StartGroup draft={draft} update={update} />
            <ColorsGroup draft={draft} update={update} palette={palette} />
            <EffectsGroup draft={draft} update={update} scheme={palette.scheme} />
            <BackdropGroup draft={draft} update={update} />
            <ImageGroup draft={draft} update={update} scheme={palette.scheme} />
            <ShapeGroup draft={draft} update={update} />
          </div>
          <PanelFooter draft={draft} palette={palette} />
        </>
      )}
    </div>,
    document.body
  )
}
