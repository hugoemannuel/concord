import type { CSSProperties } from 'react'
import { sparkLayout } from '../lib/boostSparks'
import './boost.css'

/** Faíscas que estouram do banner (SS e SSS). */
function BoostSparks({ count, color }: { count: number; color: string }): React.JSX.Element {
  return (
    <>
      {sparkLayout(count).map((spark, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="boost-motion absolute left-14 top-1/2 rounded-full"
          style={
            {
              '--dx': `${spark.dx}px`,
              '--dy': `${spark.dy}px`,
              width: spark.size,
              height: spark.size,
              background: i % 2 === 0 ? color : '#ffffff',
              boxShadow: `0 0 6px ${color}`,
              animation: `boost-spark 1s ease-out ${spark.delay}ms both`
            } as CSSProperties
          }
        />
      ))}
    </>
  )
}

export default BoostSparks
