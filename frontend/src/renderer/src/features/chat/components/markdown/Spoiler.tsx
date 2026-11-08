import { useState } from 'react'
import { isRevealKey } from '../../lib/markdown/spoiler'

/**
 * Spoiler (||texto||): fundo cobrindo o texto até alguém clicar ou apertar
 * Enter/Espaço; revelado fica revelado e não é mais clicável. Fechado, o
 * conteúdo fica invisível (nem link nem menção recebem foco).
 */
export default function Spoiler({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [shown, setShown] = useState(false)
  if (shown) return <span className="rounded bg-fg/10 px-0.5">{children}</span>
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Spoiler. Clique para revelar"
      onClick={(e) => {
        e.stopPropagation()
        setShown(true)
      }}
      onKeyDown={(e) => {
        if (!isRevealKey(e.key)) return
        e.preventDefault()
        setShown(true)
      }}
      className="focus-ring cursor-pointer rounded bg-fg/25 px-0.5 transition-colors hover:bg-fg/35"
    >
      <span aria-hidden="true" className="invisible">
        {children}
      </span>
    </span>
  )
}
