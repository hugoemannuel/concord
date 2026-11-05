import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ServerPlugin } from '../api/plugins'
import { usePluginsStore } from '../store/pluginsStore'
import { menuToggle, runExclusive } from '../lib/pluginSettingsActions'
import PluginMenu from './PluginMenu'

const p = (id: string, enabled = true): ServerPlugin => ({
  id,
  name: `Plugin ${id}`,
  description: `Descrição ${id}`,
  panel_url: 'https://x.test',
  icon: 'quebra-cabeca',
  author_username: 'mugis',
  status: 'approved',
  enabled
})

const idle = { ids: new Set<string>(), exclusive: async () => undefined }
const render = (plugins: ServerPlugin[], busy = idle): string =>
  renderToStaticMarkup(<PluginMenu serverId="s1" plugins={plugins} busy={busy} onOpen={() => {}} />)

describe('PluginMenu', () => {
  it('uma linha por plugin instalado, ligado ou não, com nome, descrição e interruptor', () => {
    const html = render([p('a'), p('b', false)])
    // Popover (não `menu`): tem interruptores e texto, e se navega com Tab.
    expect(html).toContain('role="dialog" aria-label="Plugins"')
    expect(html).not.toContain('role="menu')
    expect(html.match(/role="switch"/g)).toHaveLength(2)
    expect(html).toContain('Descrição a')
    expect(html).toContain('Descrição b')
    expect(html).toContain('role="switch" aria-checked="true" aria-label="Plugin a"')
    expect(html).toContain('role="switch" aria-checked="false" aria-label="Plugin b"')
  })

  it('o nome abre o painel só do plugin ligado', () => {
    const html = render([p('a'), p('b', false)])
    expect(html).toMatch(/<button[^>]*>Plugin a</)
    expect(html).not.toMatch(/<button[^>]*>Plugin b</)
  })

  it('pedido em andamento (vem de quem abre o menu): interruptor desabilitado', () => {
    const busy = { ...idle, ids: new Set(['a']) }
    const html = render([p('a'), p('b')], busy)
    expect(html).toContain('aria-label="Plugin a" disabled=""')
    expect(html).not.toContain('aria-label="Plugin b" disabled=""')
  })

  it('linhas com alvo de toque de 40 px e cabem em 360 px', () => {
    const html = render([p('a')])
    expect(html).toContain('min-h-10')
    expect(html).toContain('max-w-[calc(100vw-2rem)]')
  })
})

describe('menuToggle', () => {
  it('chama toggle(serverId, id, ligado) e ignora o segundo clique antes de responder', async () => {
    let finish!: () => void
    const toggle = vi.fn(() => new Promise<void>((res) => (finish = res)))
    usePluginsStore.setState({ toggle })
    const held = new Set<string>()
    const exclusive = (id: string, fn: () => Promise<void>): Promise<void> =>
      runExclusive(held, id, () => {}, fn)
    const first = menuToggle(exclusive, 's1', 'a', true)
    await menuToggle(exclusive, 's1', 'a', true)
    finish()
    await first
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(toggle).toHaveBeenCalledWith('s1', 'a', true)
  })
})
