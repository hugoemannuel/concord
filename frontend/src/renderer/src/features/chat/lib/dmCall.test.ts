import { describe, expect, it, vi } from 'vitest'
import { dmCallButton, startDmCall } from './dmCall'

const livre = { online: true, hasConversation: true, blocked: false }

describe('dmCallButton', () => {
  it('online, com conversa e sem chamada: liberado', () => {
    expect(dmCallButton(livre)).toEqual({ disabled: false, title: 'Iniciar chamada de voz' })
  })

  it('offline: desabilitado e explica', () => {
    expect(dmCallButton({ ...livre, online: false })).toEqual({
      disabled: true,
      title: 'Usuário offline'
    })
  })

  it('em outra call: liberado (ligar troca de call, estilo Discord)', () => {
    expect(dmCallButton(livre)).toEqual({ disabled: false, title: 'Iniciar chamada de voz' })
    expect('callStatus' in livre).toBe(false)
  })

  it('sem conversa aberta ou bloqueado: desabilitado', () => {
    expect(dmCallButton({ ...livre, hasConversation: false }).disabled).toBe(true)
    expect(dmCallButton({ ...livre, blocked: true }).disabled).toBe(true)
  })
})

describe('startDmCall', () => {
  it('liga para a pessoa, com @ vazio se não houver', () => {
    const start = vi.fn()
    startDmCall(start, { conversationId: 'c1', userId: 'ana', handle: '', name: 'Ana' })
    expect(start).toHaveBeenCalledWith('c1', { id: 'ana', username: '', display_name: 'Ana' })
  })

  it('sem conversa ou sem pessoa, não liga', () => {
    const start = vi.fn()
    startDmCall(start, { conversationId: null, userId: 'ana', handle: 'ana', name: 'Ana' })
    startDmCall(start, { conversationId: 'c1', userId: undefined, handle: 'ana', name: 'Ana' })
    expect(start).not.toHaveBeenCalled()
  })
})
