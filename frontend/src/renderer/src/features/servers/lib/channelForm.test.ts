import { describe, expect, it, vi } from 'vitest'
import type { Channel } from '../api/channels'
import { canSubmitChannel, saveChannel, temporaryDefaults, toggleRole, type ChannelFormApi } from './channelForm'

const api = (): ChannelFormApi => ({
  create: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn()
})

const base = {
  serverId: 's1',
  name: 'off-topic',
  editing: null,
  type: 'text' as const,
  private: true,
  roleIds: ['r1']
}

describe('saveChannel', () => {
  it('cria canal de texto (privado, com os cargos) e recarrega', async () => {
    const a = api()
    expect(await saveChannel(base, a)).toBe('Canal #off-topic criado!')
    expect(a.create).toHaveBeenCalledWith('s1', 'off-topic', 'text', {
      private: true,
      roleIds: ['r1']
    })
    expect(a.refresh).toHaveBeenCalledWith('s1')
  })

  it('criar canal não manda prazo temporário nem visualização única', async () => {
    const a = api()
    await saveChannel({ ...base, disappearingSeconds: 3600, allowViewOnce: false }, a)
    const opts = vi.mocked(a.create).mock.calls[0][3]
    expect(opts).not.toHaveProperty('disappearing_seconds')
    expect(opts).not.toHaveProperty('allow_view_once')
  })

  it('cria canal de voz', async () => {
    expect(await saveChannel({ ...base, type: 'voice', name: 'resenha' }, api())).toBe(
      'Canal de voz resenha criado!'
    )
  })

  it.each(['text', 'voice'] as const)('cria canal de %s já na categoria escolhida', async (type) => {
    const a = api()
    await saveChannel({ ...base, type, categoryId: 'categoria-jogos' }, a)
    expect(a.create).toHaveBeenCalledWith('s1', 'off-topic', type, {
      private: true, roleIds: ['r1'], categoryId: 'categoria-jogos'
    })
  })

  it('renomeia o canal editado e grava o modo lento', async () => {
    const a = api()
    const editing = { id: 'c1' } as Channel
    expect(await saveChannel({ ...base, editing, slowmodeSeconds: 30 }, a)).toBe('Canal atualizado!')
    expect(a.update).toHaveBeenCalledWith('s1', 'c1', { name: 'off-topic', slowmode_seconds: 30 })
    expect(a.create).not.toHaveBeenCalled()
    expect(a.refresh).toHaveBeenCalledWith('s1')
  })

  it('grava o prazo temporário e a visualização única do canal editado', async () => {
    const a = api()
    const editing = { id: 'c1' } as Channel
    await saveChannel({ ...base, editing, disappearingSeconds: 0, allowViewOnce: false }, a)
    expect(a.update).toHaveBeenCalledWith('s1', 'c1', {
      name: 'off-topic', disappearing_seconds: 0, allow_view_once: false
    })
  })

  it('valores iniciais do Editar canal: prazo do canal e visualização única ligada por padrão', () => {
    expect(temporaryDefaults({ disappearing_seconds: 86400, allow_view_once: false } as Channel)).toEqual({
      disappearingSeconds: 86400, allowViewOnce: false
    })
    expect(temporaryDefaults({ disappearing_seconds: null } as Channel)).toEqual({
      disappearingSeconds: 0, allowViewOnce: true
    })
  })

  it('erro do servidor sobe para quem chamou', async () => {
    const a = api()
    vi.mocked(a.create).mockRejectedValue(new Error('nome repetido'))
    await expect(saveChannel(base, a)).rejects.toThrow('nome repetido')
    expect(a.refresh).not.toHaveBeenCalled()
  })
})

describe('canSubmitChannel e toggleRole', () => {
  it('precisa de nome, servidor e não estar salvando', () => {
    expect(canSubmitChannel('geral', false, 's1')).toBe(true)
    expect(canSubmitChannel('', false, 's1')).toBe(false)
    expect(canSubmitChannel('geral', true, 's1')).toBe(false)
    expect(canSubmitChannel('geral', false, '')).toBe(false)
  })

  it('marca e desmarca cargos', () => {
    expect(toggleRole(['a'], 'b', true)).toEqual(['a', 'b'])
    expect(toggleRole(['a', 'b'], 'a', false)).toEqual(['b'])
  })
})
