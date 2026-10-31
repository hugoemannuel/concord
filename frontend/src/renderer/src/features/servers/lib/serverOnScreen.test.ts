import { describe, expect, it } from 'vitest'
import { serverOnScreen } from './serverOnScreen'

const brothers = { id: 's1', name: 'Brothers', owner_id: 'u' }

describe('serverOnScreen', () => {
  it('na tela do servidor aberto devolve o servidor', () => {
    expect(serverOnScreen('/servers/s1', brothers)).toBe(brothers)
    expect(serverOnScreen('/servers/s1/channels/c9', brothers)).toBe(brothers)
  })

  it('fora de um servidor (início, DM, melhorias) não devolve nada', () => {
    expect(serverOnScreen('/friends', brothers)).toBeNull()
    expect(serverOnScreen('/dm/u2', brothers)).toBeNull()
    expect(serverOnScreen('/melhorias', brothers)).toBeNull()
  })

  it('servidor da rota ainda carregando (outro id no store) não aparece', () => {
    expect(serverOnScreen('/servers/s2', brothers)).toBeNull()
  })

  it('sem servidor no store não devolve nada', () => {
    expect(serverOnScreen('/servers/s1', null)).toBeNull()
  })
})
