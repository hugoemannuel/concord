import { describe, expect, it } from 'vitest'
import { shouldConfirmLeave } from './leaveGuard'

describe('shouldConfirmLeave', () => {
  it('em chamada (ou ligando): fechar/recarregar a aba pede confirmação', () => {
    expect(shouldConfirmLeave('active')).toBe(true)
    expect(shouldConfirmLeave('outgoing')).toBe(true)
  })

  it('fora de chamada sai sem perguntar', () => {
    expect(shouldConfirmLeave('idle')).toBe(false)
  })
})
