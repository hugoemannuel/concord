import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ServerPlugin } from '../api/plugins'
import PluginMenu from './PluginMenu'

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
