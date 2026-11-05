import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import { saveExpressionEdit } from './expressionEdit'

const values = (name: string, emoji = ''): { name: string; emoji: string } => ({ name, emoji })

describe('salvar a edição de uma expressão', () => {
  it('nome inválido: mostra o erro no campo e nem chama o servidor', async () => {
    const save = vi.fn()
    await expect(saveExpressionEdit('emoji', values('a b'), save, 'falhou')).resolves.toEqual({
      done: false,
      error: 'O nome precisa ter de 2 a 32 letras, números ou _.',
      toast: null
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('salvou: fecha a edição', async () => {
    const save = vi.fn().mockResolvedValue({})
    await expect(
      saveExpressionEdit('sound', values('Buzina', 'x'), save, 'falhou')
    ).resolves.toEqual({
      done: true,
      error: null,
      toast: null
    })
    expect(save).toHaveBeenCalledWith({ name: 'Buzina', emoji: 'x' })
  })

  it('o servidor recusou: a mensagem dele vira aviso e a edição fica aberta', async () => {
    const save = vi
      .fn()
      .mockRejectedValue(new ApiError(409, 'Já existe um emoji com esse nome neste servidor.'))
    await expect(saveExpressionEdit('emoji', values('festa'), save, 'falhou')).resolves.toEqual({
      done: false,
      error: null,
      toast: 'Já existe um emoji com esse nome neste servidor.'
    })
  })

  it('erro sem mensagem usa o texto padrão', async () => {
    const save = vi.fn().mockRejectedValue(null)
    const result = await saveExpressionEdit(
      'sticker',
      values('risada'),
      save,
      'Não foi possível editar a figurinha.'
    )
    expect(result.toast).toBe('Não foi possível editar a figurinha.')
  })
})
