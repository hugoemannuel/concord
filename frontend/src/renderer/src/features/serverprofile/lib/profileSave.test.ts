import { beforeEach, describe, expect, it, vi } from 'vitest'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/store/toastStore', () => ({ showToast: { error: toastError } }))

import { basicsDirty, saveProfileForm, shownIcon, type ProfileFormSave } from './profileSave'

const file = new Blob(['x'])
const server = { id: 's1', name: 'Salinha' }

function form(over: Partial<ProfileFormSave> = {}): ProfileFormSave {
  return {
    server,
    name: 'Salinha',
    icon: { kind: 'keep' },
    actions: { updateServer: vi.fn(async () => {}), setServerIcon: vi.fn(async () => {}) },
    onBasicsSaved: vi.fn(),
    draftDirty: false,
    saveDraft: vi.fn(async () => true),
    ...over
  }
}

beforeEach(() => toastError.mockReset())

describe('basicsDirty', () => {
  it('o nome aparado ou o ícone', () => {
    expect(basicsDirty(server, ' Salinha ', { kind: 'keep' })).toBe(false)
    expect(basicsDirty(server, 'Outro', { kind: 'keep' })).toBe(true)
    expect(basicsDirty(server, 'Salinha', { kind: 'remove' })).toBe(true)
  })
})

describe('shownIcon', () => {
  it('a prévia, nada ou o atual', () => {
    expect(shownIcon({ kind: 'set', file, previewUrl: 'blob:x', animated: false }, '/a')).toBe('blob:x')
    expect(shownIcon({ kind: 'remove' }, '/a')).toBeNull()
    expect(shownIcon({ kind: 'keep' }, '/a')).toBe('/a')
  })
})

describe('saveProfileForm', () => {
  it('sem mudança no nome e no ícone, não chama o servidor', async () => {
    const f = form()
    await expect(saveProfileForm(f)).resolves.toBe(true)
    expect(f.actions.updateServer).not.toHaveBeenCalled()
    expect(f.actions.setServerIcon).not.toHaveBeenCalled()
    expect(f.saveDraft).not.toHaveBeenCalled()
  })

  it('salva o nome aparado, o ícone e o perfil', async () => {
    const f = form({ name: ' Novo ', icon: { kind: 'set', file, previewUrl: 'blob:x', animated: false }, draftDirty: true })
    await expect(saveProfileForm(f)).resolves.toBe(true)
    expect(f.actions.updateServer).toHaveBeenCalledWith('s1', 'Novo')
    expect(f.actions.setServerIcon).toHaveBeenCalledWith('s1', { file, staticFrame: undefined })
    expect(f.onBasicsSaved).toHaveBeenCalled()
    expect(f.saveDraft).toHaveBeenCalled()
  })

  it('remover o ícone', async () => {
    const f = form({ icon: { kind: 'remove' } })
    await saveProfileForm(f)
    expect(f.actions.setServerIcon).toHaveBeenCalledWith('s1', null)
  })

  it('falhou no nome: avisa e não mexe no perfil', async () => {
    const f = form({ name: 'Novo', draftDirty: true })
    f.actions.updateServer = vi.fn(async () => {
      throw new Error('fora')
    })
    await expect(saveProfileForm(f)).resolves.toBe(false)
    expect(toastError).toHaveBeenCalled()
    expect(f.saveDraft).not.toHaveBeenCalled()
    expect(f.onBasicsSaved).not.toHaveBeenCalled()
  })

  it('o perfil falhou: o ícone já subiu e não vai de novo', async () => {
    const f = form({ draftDirty: true, saveDraft: vi.fn(async () => false) })
    await expect(saveProfileForm(f)).resolves.toBe(false)
    expect(f.onBasicsSaved).toHaveBeenCalled()
  })
})
