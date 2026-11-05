import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)

import { useServerStore } from '../../servers/store/serverStore'
import { usePluginsStore } from '../store/pluginsStore'
import type { ServerPlugin } from '../api/plugins'
import PluginHeaderButtons from './PluginHeaderButtons'

const p = (id: string, enabled = true): ServerPlugin => ({
  id,
  name: `Plugin ${id}`,
  description: 'd',
  panel_url: 'https://x.test',
  icon: 'quebra-cabeca',
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

  it('1 ligado: um botão com o nome do plugin, sem "Plugins"', () => {
    const html = setup([p('a'), p('b', false)])
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain('aria-label="Plugin a"')
    expect(html).not.toContain('aria-label="Plugins"')
    expect(html).not.toContain('aria-haspopup')
  })

  it('alvo de toque de 40 px abaixo de md, nos botões e no "Plugins"', () => {
    expect(setup([p('a')])).toContain('max-md:size-10')
    expect(setup([p('a'), p('b'), p('c')])).toContain('max-md:size-10')
  })

  it('2 ligados: um botão por plugin com aria-label do nome', () => {
    const html = setup([p('a'), p('b'), p('c', false)])
    expect(html.match(/<button/g)).toHaveLength(2)
    expect(html).toContain('aria-label="Plugin a"')
    expect(html).toContain('aria-label="Plugin b"')
    expect(html).toContain('aria-expanded="false"')
  })

  it('usa o ícone da ficha: bola no placar, quebra-cabeça nos outros', () => {
    const bola = { ...p('a'), icon: 'bola' as const }
    expect(setup([bola])).toContain('M12 8.3L15.52')
    expect(setup([p('a')])).not.toContain('M12 8.3L15.52')
    const dois = setup([bola, p('b')])
    expect(dois.match(/M12 8\.3L15\.52/g)).toHaveLength(1)
  })

  it('o botão agrupado "Plugins" mantém o quebra-cabeça', () => {
    const bola = { ...p('a'), icon: 'bola' as const }
    expect(setup([bola, p('b'), p('c')])).not.toContain('M12 8.3L15.52')
  })

  it('3 ligados: um botão Plugins só', () => {
    const html = setup([p('a'), p('b'), p('c')])
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain('aria-label="Plugins"')
    expect(html).toContain('aria-haspopup="menu"')
  })
})
