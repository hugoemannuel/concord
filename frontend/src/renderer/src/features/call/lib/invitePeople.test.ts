import { describe, expect, it } from 'vitest'
import { chunk, serverInvitees, toggleAll } from './invitePeople'

const m = (user_id: string, display_name = '', username = user_id): never =>
  ({ server_id: 's1', user_id, role: '', display_name, username }) as never

describe('serverInvitees', () => {
  it('membros viram convidáveis, sem eu e sem quem já é amigo', () => {
    const out = serverInvitees([m('eu'), m('ana', 'Ana'), m('eli', 'Eli')], ['ana'], 'eu')
    expect(out).toEqual([
      { id: 'eli', username: 'eli', display_name: 'Eli', avatar_url: undefined, avatar_decoration_url: undefined }
    ])
  })

  it('membro sem usuário carregado fica de fora (não dá para mostrar)', () => {
    expect(serverInvitees([{ server_id: 's1', user_id: 'x', role: '' }], [], 'eu')).toEqual([])
  })
})

describe('toggleAll', () => {
  it('marca todos os que faltam, mantendo a seleção de antes', () => {
    expect(toggleAll(['a'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
    expect(toggleAll(['b'], ['b', 'c'])).toEqual(['b', 'c'])
  })

  it('com todos já marcados, desmarca só os da lista', () => {
    expect(toggleAll(['a', 'b', 'c'], ['b', 'c'])).toEqual(['a'])
  })

  it('lista vazia não muda nada', () => {
    expect(toggleAll(['a'], [])).toEqual(['a'])
  })
})

describe('chunk', () => {
  it('quebra em lotes do tamanho pedido', () => {
    expect(chunk(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']])
    expect(chunk([], 20)).toEqual([])
  })
})
