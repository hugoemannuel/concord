import { describe, expect, it } from 'vitest'
import {
  EXTERNAL_REASON,
  customIdOf,
  customKey,
  externalAllowed,
  externalNotice,
  frequentItems,
  itemPreview,
  orderServers,
  serverSections,
  withItemServers
} from './pickerSections'

const server = (id: string, name = id): { id: string; name: string } => ({ id, name })

describe('orderServers', () => {
  it('o servidor atual vem primeiro; os outros seguem a ordem da barra', () => {
    expect(orderServers([server('a'), server('b'), server('c')], 'b').map((s) => s.id)).toEqual(['b', 'a', 'c'])
  })

  it('sem servidor atual (DM) não muda a ordem', () => {
    expect(orderServers([server('a'), server('b')], null).map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('withItemServers', () => {
  it('mantém a ordem da barra e põe no fim quem só os itens conhecem', () => {
    const merged = withItemServers([server('a'), server('b')], [server('c'), server('a', 'repetido')])
    expect(merged.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(merged[0].name).toBe('a')
  })
})

describe('serverSections', () => {
  const items: Record<string, { name: string }[]> = {
    a: [{ name: 'festa' }],
    b: [{ name: 'gato' }, { name: 'Coração' }],
    c: []
  }
  const build = (currentId: string | null, search = '') =>
    serverSections({
      servers: [server('a'), server('b'), server('c'), server('d')],
      itemsOf: (id) => items[id] ?? [],
      nameOf: (item) => item.name,
      currentId,
      search
    })

  it('marca o que é de fora e tira os servidores sem nada', () => {
    expect(build('b').map((s) => [s.server.id, s.external])).toEqual([
      ['b', false],
      ['a', true]
    ])
  })

  it('o servidor atual aparece mesmo sem nada (dá para adicionar)', () => {
    expect(build('c').map((s) => s.server.id)).toEqual(['c', 'a', 'b'])
  })

  it('na DM tudo é de fora', () => {
    expect(build(null).every((s) => s.external)).toBe(true)
  })

  it('a busca alcança todos os servidores, sem acento e sem diferenciar maiúsculas', () => {
    expect(build('a', 'CORACAO').map((s) => [s.server.id, s.items.length])).toEqual([['b', 1]])
  })

  it('na busca, o servidor atual sem resultado some', () => {
    expect(build('c', 'festa').map((s) => s.server.id)).toEqual(['a'])
  })
})

describe('externalAllowed', () => {
  const base = {
    serverId: 's1',
    channelId: 'c1',
    openServerId: 's1',
    rolesLoaded: true,
    can: () => false,
    canInChannel: () => false
  }

  it('DM e grupo não têm servidor: basta ser membro da origem', () => {
    expect(externalAllowed({ ...base, serverId: null })).toBe(true)
  })

  it('no canal vale a permissão do canal', () => {
    expect(externalAllowed(base)).toBe(false)
    expect(externalAllowed({ ...base, canInChannel: () => true })).toBe(true)
  })

  it('sem canal conhecido vale a do servidor', () => {
    expect(externalAllowed({ ...base, channelId: null, can: () => true })).toBe(true)
  })

  it('sem os cargos carregados, ou em outro servidor, quem decide é o servidor', () => {
    expect(externalAllowed({ ...base, rolesLoaded: false })).toBe(true)
    expect(externalAllowed({ ...base, openServerId: 's2' })).toBe(true)
  })
})

describe('frequentItems', () => {
  const lookup = (key: string): string | undefined => ({ a: 'A', b: 'B', d: 'D' })[key]

  it('segue o ranking, pula o que sumiu e completa com os padrões', () => {
    expect(frequentItems(['a', 'sumiu', 'b'], lookup, ['b', 'd'], 4)).toEqual(['A', 'B', 'D'])
  })

  it('respeita o limite', () => {
    expect(frequentItems(['a', 'b', 'd'], lookup, [], 2)).toEqual(['A', 'B'])
  })
})

describe('itemPreview', () => {
  it('diz de que servidor vem', () => {
    expect(itemPreview(':festa:', 'Alfa', false)).toEqual({ title: ':festa:', detail: 'de Alfa', reason: undefined })
  })

  it('desabilitado diz o motivo', () => {
    expect(itemPreview(':festa:', 'Alfa', true).reason).toBe(EXTERNAL_REASON)
  })

  it('sem servidor conhecido não inventa', () => {
    expect(itemPreview('gato', undefined, false).detail).toBeUndefined()
  })
})

describe('externalNotice', () => {
  const section = (external: boolean, items: string[]) => ({ server: server('a'), external, items })

  it('com a permissão não avisa', () => {
    expect(externalNotice(true, [section(true, ['x'])])).toBeUndefined()
  })

  it('sem a permissão, avisa se há algo de fora', () => {
    expect(externalNotice(false, [section(true, ['x'])])).toBe(EXTERNAL_REASON)
  })

  it('sem nada de fora (ou seção de fora vazia) não avisa', () => {
    expect(externalNotice(false, [section(false, ['x']), section(true, [])])).toBeUndefined()
  })
})

describe('customKey e customIdOf', () => {
  it('ida e volta; emoji Unicode não tem id', () => {
    expect(customIdOf(customKey('e1'))).toBe('e1')
    expect(customIdOf('👍')).toBeNull()
  })
})
