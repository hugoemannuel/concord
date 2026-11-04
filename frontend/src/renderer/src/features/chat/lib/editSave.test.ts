import { describe, expect, it, vi } from 'vitest'
import type { Message } from '../api/messages'
import { hasMedia, saveMessageEdit, type EditSaveEnv } from './editSave'

function msg(extra: Partial<Message> = {}): Message {
  return { id: 'm1', author_id: 'me', content: 'oi', created_at: '2026-11-03T12:00:00Z', ...extra }
}

function env(overrides: Partial<EditSaveEnv> = {}): EditSaveEnv {
  return {
    room: 'channel:1',
    currentRoom: () => 'channel:1',
    edit: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    setSaving: vi.fn(),
    error: vi.fn(),
    ...overrides
  }
}

describe('hasMedia', () => {
  it('anexo, figurinha ou GIF contam; só texto não', () => {
    expect(hasMedia(msg())).toBe(false)
    expect(hasMedia(msg({ attachments: [] }))).toBe(false)
    expect(hasMedia(msg({ attachments: [{ id: 'f' }] as Message['attachments'] }))).toBe(true)
    expect(hasMedia(msg({ sticker_id: 's' }))).toBe(true)
    expect(hasMedia(msg({ gif_url: 'https://g/x.gif' }))).toBe(true)
  })
})

describe('saveMessageEdit', () => {
  it('texto igual só fecha o editor', async () => {
    const e = env()
    await saveMessageEdit(msg(), '  oi ', e)
    expect(e.close).toHaveBeenCalledOnce()
    expect(e.edit).not.toHaveBeenCalled()
  })

  it('vazio, sem anexo, avisa e mantém o editor aberto', async () => {
    const e = env()
    await saveMessageEdit(msg(), '   ', e)
    expect(e.error).toHaveBeenCalledWith('A mensagem não pode ficar vazia.')
    expect(e.close).not.toHaveBeenCalled()
    expect(e.edit).not.toHaveBeenCalled()
  })

  it('salva o texto aparado, liga e desliga o "salvando" e fecha', async () => {
    const e = env()
    await saveMessageEdit(msg(), ' novo ', e)
    expect(e.edit).toHaveBeenCalledWith('channel:1', 'm1', 'novo')
    expect(e.setSaving).toHaveBeenNthCalledWith(1, true)
    expect(e.setSaving).toHaveBeenLastCalledWith(false)
    expect(e.close).toHaveBeenCalledOnce()
  })

  it('terminou em outra sala: não fecha o editor de lá', async () => {
    const e = env({ currentRoom: () => 'channel:2' })
    await saveMessageEdit(msg(), 'novo', e)
    expect(e.close).not.toHaveBeenCalled()
  })

  it('falha com motivo conhecido avisa com ele e mantém o editor', async () => {
    const e = env({ edit: vi.fn().mockRejectedValue({ status: 404 }) })
    await saveMessageEdit(msg(), 'novo', e)
    expect(e.error).toHaveBeenCalledWith('Essa mensagem não existe mais.')
    expect(e.close).not.toHaveBeenCalled()
    expect(e.setSaving).toHaveBeenLastCalledWith(false)
  })

  it('falha sem motivo conhecido usa a mensagem do erro, ou o aviso geral', async () => {
    const e = env({ edit: vi.fn().mockRejectedValue(new Error('rede')) })
    await saveMessageEdit(msg(), 'novo', e)
    expect(e.error).toHaveBeenCalledWith('rede')
    const f = env({ edit: vi.fn().mockRejectedValue({}) })
    await saveMessageEdit(msg(), 'novo', f)
    expect(f.error).toHaveBeenCalledWith('Falha ao editar mensagem.')
  })
})
