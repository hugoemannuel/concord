import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import { canTransferTo, transferErrorMessage } from './ownershipTransfer'

describe('canTransferTo', () => {
  const base = { viewerIsOwner: true, meId: 'dono', member: { user_id: 'ana', is_bot: false } }

  it('o dono passa para outro membro de verdade', () => {
    expect(canTransferTo(base)).toBe(true)
  })

  it('não para si, nem para bot, nem se quem vê não é o dono', () => {
    expect(canTransferTo({ ...base, member: { user_id: 'dono' } })).toBe(false)
    expect(canTransferTo({ ...base, member: { user_id: 'bot', is_bot: true } })).toBe(false)
    expect(canTransferTo({ ...base, viewerIsOwner: false })).toBe(false)
  })
})

describe('transferErrorMessage', () => {
  it('traduz a recusa do servidor', () => {
    expect(transferErrorMessage(new ApiError(400, 'x'))).toBe(
      'Essa pessoa não pode receber o servidor (precisa ser membro e não pode ser bot).'
    )
    expect(transferErrorMessage(new ApiError(403, 'x'))).toBe('Só o dono pode transferir o servidor.')
    expect(transferErrorMessage(new Error('rede'))).toBe(
      'Não foi possível transferir o servidor. Tente de novo.'
    )
  })
})
