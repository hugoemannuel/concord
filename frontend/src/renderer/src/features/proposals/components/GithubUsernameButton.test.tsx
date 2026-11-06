import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ login: null as string | null }))
vi.mock('../store/proposalStore', () => ({
  useProposalStore: (select: (s: unknown) => unknown) =>
    select({ githubUsername: state.login, saveGithubUsername: vi.fn() })
}))
vi.mock('../../../shared/ui/Modal', () => ({
  default: ({
    open,
    title,
    children
  }: {
    open: boolean
    title: string
    children: React.ReactNode
  }) =>
    open ? (
      <section>
        <h2>{title}</h2>
        {children}
      </section>
    ) : null
}))

import { renderToStaticMarkup } from 'react-dom/server'
import GithubUsernameButton from './GithubUsernameButton'

describe('GithubUsernameButton', () => {
  it('sem usuário: convida a informar', () => {
    state.login = null
    const html = renderToStaticMarkup(<GithubUsernameButton />)
    expect(html).toContain('Informar GitHub')
    expect(html).not.toContain('Seu usuário do GitHub</h2>')
  })

  it('com usuário: mostra o @login', () => {
    state.login = 'octocat'
    expect(renderToStaticMarkup(<GithubUsernameButton />)).toContain('GitHub: @octocat')
  })
})
