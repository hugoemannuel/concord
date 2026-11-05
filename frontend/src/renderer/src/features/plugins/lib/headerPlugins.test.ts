import { describe, expect, it } from 'vitest'
import { MAX_HEADER_ICONS, headerPlugins } from './headerPlugins'
import type { ServerPlugin } from '../api/plugins'

const p = (id: string, enabled: boolean): ServerPlugin => ({
  id,
  name: id,
  description: '',
  panel_url: 'https://x.test',
  icon: 'quebra-cabeca',
  author_username: 'a',
  status: 'approved',
  enabled
})

describe('headerPlugins', () => {
  it('no máximo 2 ícones na barra', () => {
    expect(MAX_HEADER_ICONS).toBe(2)
  })

  it('os ligados, na ordem, cortados nos 2 primeiros', () => {
    const r = headerPlugins([p('a', true), p('b', false), p('c', true), p('d', true)])
    expect(r.map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('nenhum ligado: nenhum ícone', () => {
    expect(headerPlugins([p('a', false)])).toEqual([])
  })
})
