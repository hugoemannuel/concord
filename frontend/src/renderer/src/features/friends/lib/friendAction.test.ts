import { describe, expect, it, vi } from 'vitest'
import { runFriendAction } from './friendAction'

const user = { userId: 'u1', username: 'ana', name: 'Ana' }

const deps = (): Parameters<typeof runFriendAction>[1] => ({
  remove: vi.fn(async () => undefined),
  block: vi.fn(async () => undefined),
  error: vi.fn()
})

describe('runFriendAction', () => {
  it('remover usa o username', async () => {
    const d = deps()
    await runFriendAction({ kind: 'remove', ...user }, d)
    expect(d.remove).toHaveBeenCalledWith('ana')
    expect(d.block).not.toHaveBeenCalled()
  })

  it('bloquear usa o id', async () => {
    const d = deps()
    await runFriendAction({ kind: 'block', ...user }, d)
    expect(d.block).toHaveBeenCalledWith('u1')
    expect(d.remove).not.toHaveBeenCalled()
  })

  it('falha avisa com a mensagem do erro e repassa o erro', async () => {
    const d = deps()
    const boom = new Error('sem rede')
    d.remove = vi.fn(async () => Promise.reject(boom))
    await expect(runFriendAction({ kind: 'remove', ...user }, d)).rejects.toBe(boom)
    expect(d.error).toHaveBeenCalledWith('sem rede')
  })

  it('falha sem Error usa o texto padrão', async () => {
    const d = deps()
    d.block = vi.fn(async () => Promise.reject('x'))
    await expect(runFriendAction({ kind: 'block', ...user }, d)).rejects.toBe('x')
    expect(d.error).toHaveBeenCalledWith('Não foi possível concluir.')
  })
})
