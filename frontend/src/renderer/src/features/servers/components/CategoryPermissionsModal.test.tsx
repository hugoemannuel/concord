import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../../../shared/ui/Modal', () => ({
  default: ({ title, children }: { title?: string; children: React.ReactNode }) => <div data-modal={title}>{children}</div>
}))
vi.mock('../hooks/useServerAccess', () => ({
  useServerAccess: () => ({ isOwner: true, perms: 0xffffffff, channelPerms: () => 0xffffffff })
}))
vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) => getSnapshot())

import { Perm } from '../lib/permissions'
import { useServerStore } from '../store/serverStore'
import { CategoryPermissionsModal } from './CategoryPermissionsModal'

describe('CategoryPermissionsModal', () => {
  beforeEach(() => {
    useServerStore.setState({
      roles: [{ id: 'everyone', name: '@everyone', position: 0, is_default: true, color: null }] as never,
      currentMembers: []
    })
  })

  it('o mesmo editor do canal, com as permissões de texto e de voz', () => {
    const html = renderToStaticMarkup(
      <CategoryPermissionsModal serverId="s" run={async () => true} onClose={vi.fn()}
        category={{ id: 'c', name: 'Jogos', position: 0, overwrites: [{ target_type: 'role', target_id: 'everyone', allow: 0, deny: Perm.VIEW_CHANNEL }] }} />
    )
    expect(html).toContain('data-modal="Permissões de Jogos"')
    expect(html).toContain('Categoria privada')
    expect(html).toMatch(/role="switch" aria-checked="true"/)
    expect(html).toContain('Ver canais')
    expect(html).toContain('Enviar mensagens')
    expect(html).toContain('Conectar')
  })
})
