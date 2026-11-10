import { describe, expect, it, vi } from 'vitest'
import type { Message } from '../api/messages'
import { ApiError } from '../../../shared/api/client'
import { reportSendFailure, sendErrorText, type SendFailureEnv, type SentMessage } from './sendFailure'

const reply = { id: 'm1' } as Message

function setup(over: Partial<SendFailureEnv> = {}): {
  env: SendFailureEnv
  draft: () => string
  replyState: () => { room: string; message: Message } | null
} {
  let draft = ''
  let replyState: { room: string; message: Message } | null = null
  const env: SendFailureEnv = {
    mounted: () => true,
    currentRoom: () => 'channel:a',
    currentText: () => draft,
    setDraft: (update) => {
      draft = update(draft)
    },
    setReply: (update) => {
      replyState = update(replyState)
    },
    focusInput: vi.fn(),
    error: vi.fn(),
    copy: vi.fn(),
    ...over
  }
  return { env, draft: () => draft, replyState: () => replyState }
}

const sent = (
  text: string,
  over: Partial<{ room: string; reply: Message | null }> = {}
): SentMessage => ({
  room: 'channel:a',
  text,
  reply: null,
  ...over
})

describe('reportSendFailure', () => {
  it('campo vazio: o texto volta sozinho e a resposta também', () => {
    const t = setup()
    reportSendFailure('falhou', sent('oi', { reply }), t.env)
    expect(t.draft()).toBe('oi')
    expect(t.replyState()).toEqual({ room: 'channel:a', message: reply })
    expect(t.env.error).toHaveBeenCalledWith('falhou')
  })

  it('sem texto nem resposta, só avisa', () => {
    const t = setup()
    reportSendFailure('falhou', sent('  '), t.env)
    expect(t.draft()).toBe('')
    expect(t.env.error).toHaveBeenCalledWith('falhou')
  })

  it('já digitou outra coisa: mantém e oferece "Restaurar", que junta os dois textos', () => {
    const t = setup({ currentText: () => 'novo' })
    t.env.setDraft(() => 'novo')
    reportSendFailure('falhou', sent('oi'), t.env)
    const [message, ms, action] = vi.mocked(t.env.error).mock.calls[0]
    expect(message).toBe('falhou')
    expect(ms).toBe(10000)
    expect(action?.label).toBe('Restaurar')

    action?.run()
    expect(t.draft()).toBe('oi novo')
    expect(t.env.focusInput).toHaveBeenCalled()
  })

  it('"Restaurar" depois de sair da sala não mexe no campo e oferece copiar', () => {
    let room = 'channel:a'
    const t = setup({ currentText: () => 'novo', currentRoom: () => room })
    reportSendFailure('falhou', sent('oi'), t.env)
    const action = vi.mocked(t.env.error).mock.calls[0][2]

    room = 'channel:b'
    action?.run()

    expect(t.draft()).toBe('')
    const [msg, , copy] = vi.mocked(t.env.error).mock.calls[1]
    expect(msg).toMatch(/copie a mensagem/)
    copy?.run()
    expect(t.env.copy).toHaveBeenCalledWith('oi')
  })

  it('"Restaurar" sem texto depois de sair da sala não avisa de nada', () => {
    let room = 'channel:a'
    const t = setup({ currentText: () => 'novo', currentRoom: () => room })
    reportSendFailure('falhou', sent('', { reply }), t.env)
    const action = vi.mocked(t.env.error).mock.calls[0][2]

    room = 'channel:b'
    action?.run()

    expect(t.env.error).toHaveBeenCalledTimes(1)
  })

  it('já saiu da sala: avisa e oferece copiar o texto', () => {
    const t = setup({ currentRoom: () => 'channel:b' })
    reportSendFailure('falhou', sent('oi'), t.env)
    const [, ms, action] = vi.mocked(t.env.error).mock.calls[0]
    expect(ms).toBe(10000)
    expect(action?.label).toBe('Copiar')
    action?.run()
    expect(t.env.copy).toHaveBeenCalledWith('oi')
  })

  it('já saiu da sala e não havia texto: só avisa, sem ação', () => {
    const t = setup({ mounted: () => false })
    reportSendFailure('falhou', sent(' '), t.env)
    expect(t.env.error).toHaveBeenCalledWith('falhou', 10000, undefined)
  })
})

describe('sendErrorText', () => {
  it('erro de rede ou desconhecido vira o aviso genérico', () => {
    expect(sendErrorText(new Error('x'))).toBe('Falha ao enviar mensagem.')
  })

  it('erro da API usa a mensagem dela', () => {
    expect(sendErrorText(new ApiError(500, 'caiu'))).toBe('caiu')
    expect(sendErrorText(new ApiError(400, 'invalid attachment'))).toBe(
      'Um dos arquivos expirou; anexe de novo.'
    )
  })

  it('modo lento diz quanto falta', () => {
    expect(sendErrorText(new ApiError(429, 'slowmode', 'slowmode', { retry_after: 12 }))).toBe(
      'Modo lento: aguarde 12 s para mandar outra mensagem.'
    )
  })

  it('erro de permissão conhecido usa o texto da permissão', () => {
    expect(sendErrorText(new ApiError(403, 'forbidden', 'missing_permission'))).toBe(
      'Você não tem permissão para isso.'
    )
  })
})
