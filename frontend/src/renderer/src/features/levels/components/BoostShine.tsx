import type { CSSProperties } from 'react'
import './boost.css'

/** Brilho que corre pelo preenchimento da barra de XP enquanto há buff. */
function BoostShine({ shineMs }: { shineMs: number }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="boost-shine boost-motion absolute inset-y-0 w-1/4"
      style={{ '--boost-shine-ms': `${shineMs}ms` } as CSSProperties}
    />
  )
}

export default BoostShine
