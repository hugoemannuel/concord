import type { ProfileTheme } from '../../../../profile/lib/profileTheme'
import { EditorSection } from '../controls'
import { EffectControls } from './EffectControls'
import { BackgroundControls, BorderControls } from './ThemeControls'
import ThemePresets from './ThemePresets'

/**
 * Tema do cartão de perfil (Configurações → Perfis → Aparência), em seções
 * curtas: predefinições, borda, fundo e efeito. Quem mostra o resultado é a
 * prévia ao lado (ou em cima, no celular).
 */
export default function ProfileThemeEditor({
  value,
  onChange
}: {
  value: ProfileTheme
  onChange: (next: ProfileTheme) => void
}): React.JSX.Element {
  return (
    <>
      <EditorSection
        title="Predefinições"
        description="Um toque muda o cartão inteiro; depois ajuste o que quiser."
      >
        <ThemePresets value={value} onPick={onChange} />
      </EditorSection>
      <EditorSection title="Borda">
        <BorderControls value={value} onChange={onChange} />
      </EditorSection>
      <EditorSection title="Fundo do perfil">
        <BackgroundControls value={value} onChange={onChange} />
      </EditorSection>
      <EditorSection
        title="Efeito"
        description="Animado por cima do cartão, para todo mundo que abrir seu perfil."
      >
        <EffectControls value={value} onChange={onChange} />
      </EditorSection>
    </>
  )
}
