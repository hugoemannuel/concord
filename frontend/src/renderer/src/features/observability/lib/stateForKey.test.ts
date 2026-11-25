import { describe, expect, it } from 'vitest'
import { stateForKey } from './stateForKey'

describe('stateForKey', () => {
  it('o resultado só vale para o pedido que o gerou', () => {
    expect(stateForKey({ key: '7:0', state: 'pronto' }, '7:0', 'carregando')).toBe('pronto')
  })
  it('de outro período (ou antes do primeiro resultado), ainda carregando', () => {
    expect(stateForKey({ key: '7:0', state: 'pronto' }, '1:0', 'carregando')).toBe('carregando')
    expect(stateForKey({ key: 7, state: 'pronto' }, 3, 'carregando')).toBe('carregando')
    expect(stateForKey(null, '7:0', 'carregando')).toBe('carregando')
  })
})
