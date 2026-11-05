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

const BOLA = 'M12 8.3L15.52'

describe('PluginHeaderButtons', () => {
  beforeEach(() => usePluginsStore.setState({ byServer: {} }))

  it('nenhum plugin instalado: nenhum botão', () => {
    expect(setup([])).not.toContain('<button')
  })

  it('instalado e nenhum ligado: só o quebra-cabeça, que abre o menu', () => {
    const html = setup([p('a', false)])
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain('aria-label="Plugins"')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('max-md:size-10')
  })

  it('1 ligado (bola): quebra-cabeça e o ícone do plugin ao lado', () => {
    const bola = { ...p('a'), icon: 'bola' as const }
    const html = setup([bola, p('b', false)])
    expect(html.match(/<button/g)).toHaveLength(2)
    expect(html).toContain('aria-label="Plugins"')
    expect(html).toContain('aria-label="Plugin a"')
    expect(html.match(/M12 8\.3L15\.52/g)).toHaveLength(1)
  })

  it('3 ligados: quebra-cabeça e só os 2 primeiros ícones', () => {
    const html = setup([p('a'), p('b'), p('c')])
    expect(html.match(/<button/g)).toHaveLength(3)
    expect(html).toContain('aria-label="Plugin a"')
    expect(html).toContain('aria-label="Plugin b"')
    expect(html).not.toContain('aria-label="Plugin c"')
  })

  it('o botão Plugins é sempre o quebra-cabeça, nunca a bola', () => {
    const bola = { ...p('a', false), icon: 'bola' as const }
    expect(setup([bola])).not.toContain(BOLA)
  })
})
