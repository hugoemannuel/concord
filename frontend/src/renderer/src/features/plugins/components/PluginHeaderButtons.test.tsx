import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)

import { useServerStore } from '../../servers/store/serverStore'
import { usePluginsStore } from '../store/pluginsStore'
import type { ServerPlugin } from '../api/plugins'
import PluginHeaderButtons, { PluginMenu } from './PluginHeaderButtons'

const p = (id: string, enabled = true): ServerPlugin => ({
  id,
  name: `Plugin ${id}`,
  description: 'd',
  panel_url: 'https://x.test',
  author_username: 'mugis',
  status: 'approved',
  enabled
})

function setup(list: ServerPlugin[]): string {
  useServerStore.setState({ currentServer: { id: 's1' } as never })
  usePluginsStore.setState({ byServer: { s1: list } })
  return renderToStaticMarkup(<PluginHeaderButtons />)
}

describe('PluginHeaderButtons', () => {
  beforeEach(() => usePluginsStore.setState({ byServer: {} }))

  it('0 ligados: nenhum botão', () => {
    expect(setup([p('a', false)])).not.toContain('<button')
    expect(setup([])).not.toContain('<button')
  })

  it('2 ligados: um botão por plugin com aria-label do nome', () => {
    const html = setup([p('a'), p('b'), p('c', false)])
    expect(html.match(/<button/g)).toHaveLength(2)
    expect(html).toContain('aria-label="Plugin a"')
    expect(html).toContain('aria-label="Plugin b"')
    expect(html).toContain('aria-expanded="false"')
  })

  it('3 ligados: um botão Plugins só', () => {
    const html = setup([p('a'), p('b'), p('c')])
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain('aria-label="Plugins"')
    expect(html).toContain('aria-haspopup="menu"')
  })
})

describe('PluginMenu', () => {
  it('lista os três como menuitem', () => {
    const html = renderToStaticMarkup(
      <PluginMenu plugins={[p('a'), p('b'), p('c')]} onPick={() => {}} />
    )
    expect(html).toContain('role="menu"')
    expect(html.match(/role="menuitem"/g)).toHaveLength(3)
    expect(html).toContain('Plugin b')
  })
})
