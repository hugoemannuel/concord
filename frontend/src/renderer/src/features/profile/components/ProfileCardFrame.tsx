import type { CSSProperties, ReactNode, Ref } from 'react'
import type { ProfileThemeLook } from '../lib/profileTheme'
import EffectLayer from './EffectLayer'
import '../../../assets/profileTheme.css'

/**
 * Moldura do cartão de perfil com o tema da pessoa: borda (sólida, neon,
 * arco-íris, degradê), fundo do corpo e o efeito por cima. Igual em todo lugar
 * onde o cartão aparece (o que abre ao clicar e a prévia do editor). `look`
 * vem de profileThemeLook(resolveProfileTheme(...)); o efeito (look.fx) só é
 * desenhado se `effect` vier (as miniaturas das predefinições não animam).
 */
export default function ProfileCardFrame({
  look,
  effect,
  className = '',
  style,
  children,
  ref,
  ...rest
}: {
  look: ProfileThemeLook
  effect?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
  ref?: Ref<HTMLDivElement>
} & Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'style' | 'className' | 'children'
>): React.JSX.Element {
  return (
    <div
      ref={ref}
      {...rest}
      className={`${look.className} ${className}`.trim()}
      style={{ ...look.style, ...style }}
    >
      {children}
      {effect && effect !== 'none' && <EffectLayer fx={look.fx} />}
    </div>
  )
}
