import { describe, expect, it, vi } from 'vitest'
import { saveGroupName } from './groupRename'

const conv = { id: 'g1', name: ' Os amigos ' }

const deps = (): Parameters<typeof saveGroupName>[0] => ({
  rename: vi.fn(async () => undefined),
  refresh: vi.fn(async () => undefined),
  error: vi.fn()
})

describe('saveGroupName', () => {
  it('sem edição não chama a API', async () => {
    const d = deps()
    await saveGroupName(d, conv, null)
    expect(d.rename).not.toHaveBeenCalled()
  })

  it('mesmo nome (ignorando espaços) não chama a API', async () => {
    const d = deps()
    await saveGroupName(d, conv, 'Os amigos  ')
    expect(d.rename).not.toHaveBeenCalled()
  })

  it('nome novo: renomeia com o texto digitado e recarrega as conversas', async () => {
    const d = deps()
    await saveGroupName(d, conv, 'Turma ')
    expect(d.rename).toHaveBeenCalledWith('g1', 'Turma ')
    expect(d.refresh).toHaveBeenCalled()
    expect(d.error).not.toHaveBeenCalled()
  })

  it('falha avisa com a mensagem do erro', async () => {
    const d = deps()
    d.rename = vi.fn(async () => Promise.reject(new Error('sem permissão')))
    await saveGroupName(d, conv, 'Turma')
    expect(d.refresh).not.toHaveBeenCalled()
    expect(d.error).toHaveBeenCalledWith('sem permissão')
  })

  it('falha sem Error usa o texto padrão', async () => {
    const d = deps()
    d.refresh = vi.fn(async () => Promise.reject('x'))
    await saveGroupName(d, conv, 'Turma')
    expect(d.error).toHaveBeenCalledWith('Não foi possível renomear.')
  })
})
