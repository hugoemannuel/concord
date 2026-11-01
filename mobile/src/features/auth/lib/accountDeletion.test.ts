import { ApiError } from '../../../shared/api/client'
import { deletionFailure, submitAccountDeletion } from './accountDeletion'

describe('deletionFailure', () => {
  it('lista os servidores que impedem a exclusão', () => {
    const err = new ApiError(409, 'x', 'owns_servers', {
      servers: [{ id: 's1', name: 'Amigos' }, { id: 7 }, 'lixo']
    })
    expect(deletionFailure(err)).toEqual({
      kind: 'owns_servers',
      servers: [{ id: 's1', name: 'Amigos' }]
    })
  })

  it('senha errada, muitas tentativas e erro genérico viram mensagem', () => {
    expect(deletionFailure(new ApiError(403, 'x', 'wrong_password'))).toEqual({
      kind: 'message',
      message: 'Senha incorreta.'
    })
    expect(deletionFailure(new ApiError(429, 'x'))).toEqual({
      kind: 'message',
      message: 'Muitas tentativas. Espere alguns minutos e tente de novo.'
    })
    expect(deletionFailure(new Error('rede'))).toEqual({
      kind: 'message',
      message: 'Não foi possível excluir a conta. Tente de novo.'
    })
  })
})

describe('submitAccountDeletion', () => {
  it('sem senha nem confirmação não chama o servidor', async () => {
    const send = jest.fn()
    expect(await submitAccountDeletion({ password: '', confirmed: true, send })).toEqual({
      kind: 'message',
      message: 'Digite a sua senha.'
    })
    expect(await submitAccountDeletion({ password: 'x', confirmed: false, send })).toEqual({
      kind: 'message',
      message: 'Marque que você entende que não dá para desfazer.'
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('exclui e devolve null; erro do servidor vira falha', async () => {
    const send = jest.fn().mockResolvedValue(undefined)
    expect(await submitAccountDeletion({ password: 'x', confirmed: true, send })).toBeNull()
    expect(send).toHaveBeenCalledWith('x')

    const fail = jest.fn().mockRejectedValue(new ApiError(403, 'x', 'wrong_password'))
    expect(await submitAccountDeletion({ password: 'x', confirmed: true, send: fail })).toEqual({
      kind: 'message',
      message: 'Senha incorreta.'
    })
  })
})
