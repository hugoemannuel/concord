import { afterEach, describe, expect, it, vi } from 'vitest'

// App web (yarn build:web) servido por um servidor próprio: o link de convite
// tem que levar ao app desse servidor, não ao app-salinha oficial.
vi.mock('../../../shared/lib/config', () => ({ IS_WEB: true }))
vi.mock('../api/servers', () => ({
  getInviteCode: vi.fn(() => new Promise(() => {})),
  rotateInviteCode: vi.fn()
}))
vi.mock('../../friends/components/ConfirmModal', () => ({ default: () => null }))
vi.mock('../store/inviteCodeStore', () => ({
  useInviteCodeStore: Object.assign(
    (select: (s: { codes: Record<string, string> }) => unknown) => select({ codes: { s1: 'K7P2QX9M' } }),
    { getState: () => ({ set: vi.fn() }) }
  )
}))

import { renderToStaticMarkup } from 'react-dom/server'
import InviteCodeBox from './InviteCodeBox'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('InviteCodeBox no app web', () => {
  it('monta o link com o endereço da própria página', () => {
    vi.stubGlobal('location', { origin: 'https://1-2-3-4.sslip.io' })
    const html = renderToStaticMarkup(<InviteCodeBox serverId="s1" />)
    expect(html).toContain('value="https://1-2-3-4.sslip.io/convite/K7P2QX9M"')
    expect(html).not.toContain('app-salinha.bhrx.com.br')
  })
})
