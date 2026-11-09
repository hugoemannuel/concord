import { ApiError } from '../../../shared/api/client'
import { sendNotice, sendOutcomeOf } from './sendOutcome'

describe('resultado do envio', () => {
  it('traduz o erro do servidor', () => {
    expect(sendOutcomeOf(new ApiError(403, 'no'))).toBe('forbidden')
    expect(sendOutcomeOf(new ApiError(429, 'slow', 'slowmode', { retry_after: 12 }))).toEqual({ slowmode: 12 })
    expect(sendOutcomeOf(new ApiError(429, 'slow', 'slowmode'))).toEqual({ slowmode: 1 })
    expect(sendOutcomeOf(new ApiError(500, 'caiu'))).toBe('error')
    expect(sendOutcomeOf(new Error('rede'))).toBe('error')
  })

  it('escolhe o aviso embaixo do campo', () => {
    expect(sendNotice('ok')).toBeNull()
    expect(sendNotice('empty')).toBeNull()
    expect(sendNotice({ slowmode: 12 })).toBe('Modo lento: aguarde 12 s para mandar outra mensagem.')
    expect(sendNotice('forbidden', 'Sem permissão.')).toBe('Sem permissão.')
    expect(sendNotice('forbidden')).toBe('Não foi possível enviar. Tente de novo.')
    expect(sendNotice('error', 'Sem permissão.')).toBe('Não foi possível enviar. Tente de novo.')
  })
})
