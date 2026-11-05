import { describe, expect, it } from 'vitest'
import { GROUP_AT, headerPlugins, shouldGroup } from './headerPlugins'
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
  it('filtra os ligados e mantém a ordem', () => {
    const r = headerPlugins([p('a', true), p('b', false), p('c', true)])
    expect(r.map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('agrupa a partir de GROUP_AT', () => {
    expect(GROUP_AT).toBe(3)
    expect(shouldGroup(2)).toBe(false)
    expect(shouldGroup(3)).toBe(true)
  })
})
