import { describe, expect, it, vi } from 'vitest'
import { joinFriendCall } from './joinFriendCall'

const target = { serverId: 's1', channelId: 'ch1' }

function deps(join: () => Promise<void>, opts: { inDmCall?: boolean; landed?: boolean } = {}) {
  return {
    join: vi.fn(join),
    navigate: vi.fn(),
    toastError: vi.fn(),
    inDmCall: () => opts.inDmCall ?? false,
    landed: vi.fn(() => opts.landed ?? true)
  }
}

describe('joinFriendCall', () => {
  it('entra e abre a tela do canal', async () => {
    const d = deps(() => Promise.resolve())
    await joinFriendCall(target, d)
    expect(d.join).toHaveBeenCalledWith('ch1')
    expect(d.navigate).toHaveBeenCalledWith('/servers/s1/channels/ch1')
    expect(d.toastError).not.toHaveBeenCalled()
  })

  it('erro com mensagem vira toast e não navega', async () => {
    const d = deps(() => Promise.reject(new Error('Você já está em uma chamada.')))
    await joinFriendCall(target, d)
    expect(d.toastError).toHaveBeenCalledWith('Você já está em uma chamada.')
    expect(d.navigate).not.toHaveBeenCalled()
  })

  it('erro sem mensagem usa o texto padrão', async () => {
    const d = deps(() => Promise.reject('x'))
    await joinFriendCall(target, d)
    expect(d.toastError).toHaveBeenCalledWith('Falha ao conectar ao canal de voz.')
  })

  it('em call de DM recusa sem tentar entrar', async () => {
    const d = deps(() => Promise.resolve(), { inDmCall: true })
    await joinFriendCall(target, d)
    expect(d.join).not.toHaveBeenCalled()
    expect(d.toastError).toHaveBeenCalledWith('Você já está em uma chamada.')
    expect(d.navigate).not.toHaveBeenCalled()
  })

  it('entrada que falhou sem lançar (o store já avisou) não navega', async () => {
    const d = deps(() => Promise.resolve(), { landed: false })
    await joinFriendCall(target, d)
    expect(d.landed).toHaveBeenCalledWith('ch1')
    expect(d.navigate).not.toHaveBeenCalled()
  })
})
