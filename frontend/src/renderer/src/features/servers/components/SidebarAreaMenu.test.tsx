import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// O portal não existe no SSR: o menu aparece no lugar.
vi.mock('react-dom', async (original) => ({ ...(await original<typeof import('react-dom')>()), createPortal: (node: React.ReactNode) => node }))
vi.stubGlobal('document', { body: {} })
vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) => getSnapshot())

import { useAuthStore } from '../../auth/store/authStore'
import { Perm } from '../lib/permissions'
import type { ServerAccess } from '../lib/serverAccess'
import { useHideMutedStore } from '../store/hideMutedStore'
import { SidebarAreaMenu } from './SidebarAreaMenu'

const access = (perms: number): ServerAccess => ({ can: (bit: number) => (perms & bit) !== 0 }) as unknown as ServerAccess
const render = (perms: number): string =>
  renderToStaticMarkup(<SidebarAreaMenu serverId="s1" access={access(perms)} point={{ x: 10, y: 20 }} onClose={vi.fn()} />)

describe('SidebarAreaMenu', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'ana' } as never })
    useHideMutedStore.setState({ byKey: {} })
  })

  it('quem gerencia e convida vê tudo', () => {
    const html = render(Perm.MANAGE_CHANNELS | Perm.CREATE_INVITE)
    for (const label of ['Ocultar canais silenciados', 'Criar canal', 'Criar categoria', 'Convidar pessoas']) expect(html).toContain(label)
    expect(html).toContain('role="menu"')
  })

  it('sem permissão, só o que é da própria pessoa', () => {
    const html = render(0)
    expect(html).toContain('Ocultar canais silenciados')
    expect(html).not.toContain('Criar canal')
    expect(html).not.toContain('Criar categoria')
    expect(html).not.toContain('Convidar pessoas')
  })

  it('a marca diz se está ligado', () => {
    expect(render(0)).toContain('role="menuitemcheckbox" aria-checked="false"')
    useHideMutedStore.getState().toggle('ana', 's1')
    expect(render(0)).toContain('role="menuitemcheckbox" aria-checked="true"')
  })

  it('não passa da tela em 360 px', () => {
    const html = render(0)
    expect(html).toContain('max-w-[calc(100vw-1rem)]')
    expect(html).toContain('min(10px, calc(100vw - 15rem))')
  })
})
