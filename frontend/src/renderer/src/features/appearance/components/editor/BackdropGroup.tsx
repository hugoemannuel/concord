import { EffectControls } from '../../../settings/components/profile/theme/ThemeControls'
import { fromProfileEffect, toProfileEffect } from '../../lib/backdropEditor'
import { EditorGroup } from './EditorGroup'
import type { GroupProps } from './types'

/**
 * Efeito animado no fundo do app: os mesmos efeitos e controles do cartão de
 * perfil. Fica atrás das conversas (components/ThemeBackdrop).
 */
export function BackdropGroup({ draft, update }: GroupProps): React.JSX.Element {
  return (
    <EditorGroup title="Efeitos">
      <p className="text-ds-xs text-muted">
        Uma animação no fundo do app, atrás das conversas. Os painéis ficam um pouco transparentes para ela aparecer, e
        ela nunca fica por cima do texto. Fica parada se o sistema pedir menos movimento.
      </p>
      <EffectControls
        value={toProfileEffect(draft)}
        onChange={(next) => update(fromProfileEffect(next), 'effect')}
      />
    </EditorGroup>
  )
}
