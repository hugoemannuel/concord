import { describe, expect, it } from 'vitest'
import type { ServerPlugin } from '../api/plugins'
import { findOpenPlugin, pruneOpen } from './openPlugin'

const p = (id: string, enabled = true): ServerPlugin => ({
  id,
  name: id,
  description: 'd',
  panel_url: 'https://x.test',
  icon: 'quebra-cabeca',
  author_username: 'mugis',
  status: 'approved',
  enabled
})

describe('findOpenPlugin', () => {
  const open = { serverId: 's1', pluginId: 'a' }

  it('acha o plugin aberto no servidor atual', () => {
    expect(findOpenPlugin(open, 's1', [p('a'), p('b')])?.id).toBe('a')
  })

  it('3º ligado (sem ícone na barra, aberto pelo menu): acha', () => {
    const third = { serverId: 's1', pluginId: 'c' }
    expect(findOpenPlugin(third, 's1', [p('a'), p('b'), p('c')])?.id).toBe('c')
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

describe('pruneOpen', () => {
  const open = { serverId: 's1', pluginId: 'a' }

  it('plugin ainda aberto: devolve o mesmo objeto (sem novo render)', () => {
    expect(pruneOpen(open, 's1', [p('a')])).toBe(open)
  })

  it('desinstalado, desligado ou outro servidor: limpa para não reabrir sozinho', () => {
    expect(pruneOpen(open, 's1', [p('b')])).toBeNull()
    expect(pruneOpen(open, 's1', [p('a', false)])).toBeNull()
    expect(pruneOpen(open, 's2', [p('a')])).toBeNull()
  })

  it('nada aberto: null', () => {
    expect(pruneOpen(null, 's1', [p('a')])).toBeNull()
  })
})
