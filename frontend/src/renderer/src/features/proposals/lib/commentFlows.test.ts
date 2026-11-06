import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import { commentEdit, reactError, runCommentEdit, type CommentEditDeps } from './commentFlows'

describe('reactError', () => {
  it('emojis demais e e-mail sem confirmar têm texto próprio', () => {
    expect(reactError(new ApiError(400, 'x', 'too_many_reactions'))).toBe(
      'Esse comentário já tem emojis demais.'
    )
    expect(reactError(new ApiError(403, 'x', 'email_not_verified'))).toBe(
      'Confirme seu e-mail para reagir.'
    )
  })

  it('outro erro da API ou comum: a mensagem dele', () => {
    expect(reactError(new ApiError(500, 'caiu', 'outro'))).toBe('caiu')
    expect(reactError(new Error('offline'))).toBe('offline')
  })

  it('sem mensagem (ou nem é Error): o padrão', () => {
    expect(reactError(new Error(''))).toBe('Não foi possível reagir.')
    expect(reactError('x')).toBe('Não foi possível reagir.')
  })
})

describe('commentEdit', () => {
  it('vazio sem anexo, ou ocupado: não faz nada', () => {
    expect(commentEdit('   ', 'antes', false, false)).toBe('skip')
    expect(commentEdit('novo', 'antes', false, true)).toBe('skip')
  })

  it('vazio com anexo pode salvar', () => {
    expect(commentEdit('  ', 'antes', true, false)).toEqual({ body: '' })
  })

  it('igual ao original: só fecha', () => {
    expect(commentEdit(' antes ', 'antes', false, false)).toBe('unchanged')
  })

  it('texto novo: salva aparado', () => {
    expect(commentEdit(' novo ', 'antes', false, false)).toEqual({ body: 'novo' })
  })
})

const deps = (save: CommentEditDeps['save']): CommentEditDeps & { log: string[] } => {
  const log: string[] = []
  return {
    log,
    save,
    done: () => log.push('done'),
    setBusy: (b) => log.push(`busy:${b}`),
    error: (m) => log.push(`erro:${m}`)
  }
}

describe('runCommentEdit', () => {
  it('skip: nada', async () => {
    const d = deps(vi.fn())
    await runCommentEdit('skip', d)
    expect(d.log).toEqual([])
    expect(d.save).not.toHaveBeenCalled()
  })

  it('unchanged: só fecha a edição', async () => {
    const d = deps(vi.fn())
    await runCommentEdit('unchanged', d)
    expect(d.log).toEqual(['done'])
    expect(d.save).not.toHaveBeenCalled()
  })

  it('salva, fecha e libera', async () => {
    const d = deps(vi.fn(async () => {}))
    await runCommentEdit({ body: 'novo' }, d)
    expect(d.save).toHaveBeenCalledWith('novo')
    expect(d.log).toEqual(['busy:true', 'done', 'busy:false'])
  })

  it('falhou: avisa (mensagem do erro ou o padrão), não fecha e libera', async () => {
    const d = deps(vi.fn(async () => Promise.reject(new Error('offline'))))
    await runCommentEdit({ body: 'novo' }, d)
    expect(d.log).toEqual(['busy:true', 'erro:offline', 'busy:false'])
    const d2 = deps(vi.fn(async () => Promise.reject('x')))
    await runCommentEdit({ body: 'novo' }, d2)
    expect(d2.log).toContain('erro:Não foi possível editar o comentário.')
  })
})
