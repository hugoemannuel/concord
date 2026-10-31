import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { boostRank } from '../lib/boost'

const active = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('../hooks/useBoostBanner', () => ({ useActiveBoostBanner: () => active.value }))

import BoostBanner from './BoostBanner'

describe('BoostBanner', () => {
  beforeEach(() => {
    active.value = null
  })

  it('sem banner ativo (outra call, mutado ou surdo), não desenha nada', () => {
    expect(renderToStaticMarkup(<BoostBanner />)).toBe('')
  })

  it('com banner ativo, mostra o rank', () => {
    active.value = {
      celebration: { callId: 'c1', percent: 175, eligible: 4, key: 7 },
      rank: boostRank(175)
    }
    const html = renderToStaticMarkup(<BoostBanner />)
    expect(html).toContain('Blast!')
    expect(html).toContain('x1.75')
  })
})
