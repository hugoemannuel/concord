import { describe, expect, it } from 'vitest'
import type { ServerPlugin } from '../api/plugins'
import { findOpenPlugin } from './openPlugin'

const p = (id: string, enabled = true): ServerPlugin => ({
  id,
  name: id,
  description: 'd',
  panel_url: 'https://x.test',
  author_username: 'mugis',
  status: 'approved',
  enabled
})

describe('findOpenPlugin', () => {
  const open = { serverId: 's1', pluginId: 'a' }

  it('acha o plugin aberto no servidor atual', () => {
    expect(findOpenPlugin(open, 's1', [p('a'), p('b')])?.id).toBe('a')
  })

  it('nada aberto: undefined', () => {
    expect(findOpenPlugin(null, 's1', [p('a')])).toBeUndefined()
  })

  it('o plugin some (desinstalado): fecha', () => {
    expect(findOpenPlugin(open, 's1', [p('b')])).toBeUndefined()
  })

  it('o plugin foi desligado: fecha', () => {
    expect(findOpenPlugin(open, 's1', [p('a', false)])).toBeUndefined()
  })

  it('o servidor mudou: fecha, mesmo com o mesmo id na lista', () => {
    expect(findOpenPlugin(open, 's2', [p('a')])).toBeUndefined()
    expect(findOpenPlugin(open, undefined, [p('a')])).toBeUndefined()
  })
})
