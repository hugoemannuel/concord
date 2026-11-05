import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('./InviteCodeBox', () => ({ default: () => <div data-codigo="" /> }))
// SSR não tem portal: o modal vai direto para a saída.
vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  createPortal: (node: React.ReactNode) => node
}))

// SSR lê o estado atual do zustand (mesmo truque do ImageContextMenu.test).
vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)

import { useServerStore } from '../store/serverStore'
import { useFriendStore } from '../../friends/store/friendStore'
import { useUIStore } from '../../../shared/store/uiStore'
import ServerInviteModal from './ServerInviteModal'

const server = { id: 's1', name: 'Salinha' } as never

function render(): string {
  return renderToStaticMarkup(<ServerInviteModal server={server} />)
}

describe('ServerInviteModal', () => {
  afterEach(() => vi.unstubAllGlobals())
  beforeEach(() => {
    vi.stubGlobal('document', { body: {} })
    useUIStore.setState({ serverInviteModalOpen: true })
    useServerStore.setState({
      currentMembers: [{ user_id: 'ana' }] as never
    })
    useFriendStore.setState({
      friends: [
        { id: 'ana', username: 'ana', display_name: 'Ana' },
        { id: 'bia', username: 'bia', display_name: 'Bia' },
        { id: 'cris', username: 'cris' }
      ] as never
    })
  })

  it('fechado, não aparece', () => {
    useUIStore.setState({ serverInviteModalOpen: false })
    expect(render()).toBe('')
  })

  it('aberto: código, e cada amigo que não é membro com Convidar (vai pela DM)', () => {
    const html = render()
    expect(html).toContain('Convidar amigos para Salinha')
    expect(html).toContain('data-codigo')
    expect(html).toContain('Ou mande o convite na conversa com um amigo.')
    expect(html).toContain('Já é membro')
    expect(html).not.toContain('Convite pendente')
    expect(html).toContain('@cris')
    expect(html.split('>Convidar</button>')).toHaveLength(3)
  })

  it('sem amigos: explica onde adicionar', () => {
    useFriendStore.setState({ friends: [] })
    expect(render()).toContain('Você ainda não tem amigos para convidar')
  })
})
