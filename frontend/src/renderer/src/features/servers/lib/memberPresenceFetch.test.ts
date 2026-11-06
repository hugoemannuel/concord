import { describe, expect, it, vi } from 'vitest'
import { createMemberPresenceFetch } from './memberPresenceFetch'

const members = (...ids: string[]): Array<{ user_id: string; role_ids?: string[] }> =>
  ids.map((user_id) => ({ user_id }))

function setup(): {
  sync: ReturnType<typeof createMemberPresenceFetch>
  fetch: ReturnType<typeof vi.fn>
} {
  const fetch = vi.fn()
  return { sync: createMemberPresenceFetch(fetch), fetch }
}

describe('createMemberPresenceFetch', () => {
  it('abre o servidor: busca a presença de todos os membros uma vez', () => {
    const { sync, fetch } = setup()
    sync('s1', members('a', 'b'))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(['a', 'b'])
  })

  it('mudança de cargo ou apelido (lista nova, mesmos membros) não refaz a busca', () => {
    const { sync, fetch } = setup()
    sync('s1', members('a', 'b'))
    sync('s1', members('a', 'b').map((m) => ({ ...m, role_ids: ['mod'] })))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('membro novo: busca só ele', () => {
    const { sync, fetch } = setup()
    sync('s1', members('a', 'b'))
    sync('s1', members('a', 'b', 'c'))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenLastCalledWith(['c'])
  })

  it('troca de servidor busca uma vez, mesmo com a tela guardada e depois a resposta nova', () => {
    const { sync, fetch } = setup()
    sync('s1', members('a', 'b'))
    fetch.mockClear()
    // tela guardada do s2 e, logo depois, a leitura nova (outro array, mesmos membros)
    sync('s2', members('b', 'c'))
    sync('s2', members('b', 'c'))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(['b', 'c'])
  })

  it('servidor ainda não carregado (null): não busca nem esquece o que já buscou', () => {
    const { sync, fetch } = setup()
    sync('s1', members('a'))
    sync(null, members('a'))
    sync('s1', members('a'))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('lista vazia ou repetida: não busca nada à toa', () => {
    const { sync, fetch } = setup()
    sync('s1', [])
    expect(fetch).not.toHaveBeenCalled()
    sync('s1', members('a', 'a'))
    expect(fetch).toHaveBeenCalledWith(['a'])
  })
})
