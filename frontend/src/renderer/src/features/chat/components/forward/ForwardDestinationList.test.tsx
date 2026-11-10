import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)

import type { ForwardDestination } from '../../lib/forward'
import ForwardDestinationList from './ForwardDestinationList'

const dm: ForwardDestination = {
  key: 'conversation:dm1',
  kind: 'conversation',
  label: 'Bia',
  hint: 'bia',
  target: { conversation_id: 'dm1' },
  avatar: { userId: 'bia' }
}
const group: ForwardDestination = { key: 'conversation:g1', kind: 'conversation', label: 'Turma', hint: 'Grupo', target: { conversation_id: 'g1' } }
const channel: ForwardDestination = { key: 'channel:c1', kind: 'channel', label: '#geral', hint: 'Salinha', target: { channel_id: 'c1' } }

const render = (items: ForwardDestination[], loading = false, selectedKey?: string): string =>
  renderToStaticMarkup(
    <ForwardDestinationList items={items} loading={loading} selectedKey={selectedKey} onSelect={() => {}} />
  )

describe('ForwardDestinationList', () => {
  it('uma linha por destino, com o escolhido marcado', () => {
    const html = render([dm, group, channel], false, 'channel:c1')
    expect(html).toContain('Bia')
    expect(html).toContain('Turma')
    expect(html).toContain('#geral')
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).not.toContain('Nada encontrado.')
  })

  it('sem resultado avisa; carregando mostra a rodinha no lugar', () => {
    expect(render([])).toContain('Nada encontrado.')
    const loading = render([], true)
    expect(loading).not.toContain('Nada encontrado.')
    expect(loading).toContain('animate-spin')
  })
})
