import { describe, expect, it, vi } from 'vitest'
import type { ConversationSummary } from '../../chat/api/conversations'
import { dropConversation } from './dropConversation'

const conv = { id: 'c1', type: 'dm' } as ConversationSummary

const deps = (active = false): Parameters<typeof dropConversation>[0] => ({
  request: vi.fn(async () => undefined),
  removeLocal: vi.fn(),
  isActive: () => active,
  leave: vi.fn(),
  error: vi.fn()
})

describe('dropConversation', () => {
  it('chama a API, tira da lista e fica na tela se não era a aberta', async () => {
    const d = deps()
    await dropConversation(d, conv, 'padrão')
    expect(d.request).toHaveBeenCalledWith('c1')
    expect(d.removeLocal).toHaveBeenCalledWith('c1')
    expect(d.leave).not.toHaveBeenCalled()
    expect(d.error).not.toHaveBeenCalled()
  })

  it('era a conversa aberta: volta para Amigos', async () => {
    const d = deps(true)
    await dropConversation(d, conv, 'padrão')
    expect(d.leave).toHaveBeenCalled()
  })

  it('falha: não mexe na lista e avisa com a mensagem do erro', async () => {
    const d = deps(true)
    d.request = vi.fn(async () => Promise.reject(new Error('sem rede')))
    await dropConversation(d, conv, 'padrão')
    expect(d.removeLocal).not.toHaveBeenCalled()
    expect(d.leave).not.toHaveBeenCalled()
    expect(d.error).toHaveBeenCalledWith('sem rede')
  })

  it('falha sem Error usa o texto padrão', async () => {
    const d = deps()
    d.request = vi.fn(async () => Promise.reject('x'))
    await dropConversation(d, conv, 'Não foi possível fechar a DM.')
    expect(d.error).toHaveBeenCalledWith('Não foi possível fechar a DM.')
  })
})
