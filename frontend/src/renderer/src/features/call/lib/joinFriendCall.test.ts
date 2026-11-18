import { describe, expect, it, vi } from 'vitest'
import { isInDmCall, joinFriendCall, landedIn } from './joinFriendCall'

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

describe('isInDmCall', () => {
  it('só call que não é de canal conta', () => {
    expect(isInDmCall({ status: 'active', type: 'dm' })).toBe(true)
    expect(isInDmCall({ status: 'active', type: 'channel' })).toBe(false)
    expect(isInDmCall({ status: 'idle', type: null })).toBe(false)
  })
})

describe('landedIn', () => {
  const idle = { status: 'idle', channelId: null, knock: null }
  it('conectado no canal ou batendo na porta dele', () => {
    expect(landedIn({ status: 'active', channelId: 'ch1', knock: null }, 'ch1')).toBe(true)
    expect(landedIn({ ...idle, knock: { channelId: 'ch1' } }, 'ch1')).toBe(true)
  })
  it('parado, em outro canal ou batendo em outra porta não conta', () => {
    expect(landedIn(idle, 'ch1')).toBe(false)
    expect(landedIn({ status: 'active', channelId: 'ch2', knock: null }, 'ch1')).toBe(false)
    expect(landedIn({ ...idle, knock: { channelId: 'ch2' } }, 'ch1')).toBe(false)
  })
})
