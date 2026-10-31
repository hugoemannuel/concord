import type { CSSProperties } from 'react'
import { emberLayout } from '../lib/boostBar'
import './boost.css'

/** Brasas que sobem da barra de XP nos ranks SS e SSS. */
function BoostEmbers({ color, count }: { color: string; count: number }): React.JSX.Element {
  return (
    <>
      {emberLayout(count).map((ember, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="boost-ember boost-motion pointer-events-none absolute -top-0.5 h-[3px] w-[3px] rounded-full"
          style={
            {
              left: ember.left,
              background: color,
              boxShadow: `0 0 4px ${color}`,
              '--dx': `${ember.dx}px`,
              '--delay': `${ember.delay}ms`
            } as CSSProperties
          }
        />
      ))}
    </>
  )
}

export default BoostEmbers
