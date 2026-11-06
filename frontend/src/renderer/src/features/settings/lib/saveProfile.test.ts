import { describe, expect, it, vi } from 'vitest'
import type { User } from '../../auth/store/authStore'
import { draftFromProfile, type ProfileDraft } from '../../profile/lib/profileValidation'
import { previewMedia, saveErrorMessage, saveProfile, type SaveProfileDeps } from './saveProfile'

const user = (over: Partial<User> = {}): User =>
  ({ id: 'u1', username: 'ana', display_name: 'Ana', email: 'a@x.com', ...over }) as User

function setup(
  draft: ProfileDraft,
  saved = user()
): { deps: SaveProfileDeps; state: { draft: ProfileDraft; saved: User } } {
  const state = { draft, saved }
  const deps: SaveProfileDeps = {
    draft: () => state.draft,
    savedUser: () => state.saved,
    upload: vi.fn(async () => user({ avatar_url: '/a.png' })),
    remove: vi.fn(async () => user({ banner_url: null })),
    update: vi.fn(async (f) => user({ display_name: f.display_name })),
    commit: vi.fn((u: User) => {
      state.saved = u
    }),
    keepMedia: vi.fn((kind) => {
      state.draft = { ...state.draft, [kind]: { kind: 'keep' } }
    }),
    setProgress: vi.fn(),
    setDraft: vi.fn((d: ProfileDraft) => {
      state.draft = d
    })
  }
  return { deps, state }
}

describe('saveProfile', () => {
  it('nada mudou: não chama o servidor e só realinha o rascunho', async () => {
    const { deps } = setup(draftFromProfile(user()))
    await saveProfile(deps)
    expect(deps.update).not.toHaveBeenCalled()
    expect(deps.upload).not.toHaveBeenCalled()
    expect(deps.setDraft).toHaveBeenCalledOnce()
  })

  it('envia avatar, remove banner e depois salva os campos', async () => {
    const file = new Blob(['x'])
    const draft: ProfileDraft = {
      ...draftFromProfile(user()),
      display_name: 'Ana Nova',
      avatar: { kind: 'set', file, previewUrl: 'blob:1', animated: false },
      banner: { kind: 'remove' }
    }
    const { deps, state } = setup(draft)
    await saveProfile(deps)
    expect(deps.upload).toHaveBeenCalledWith('avatar', file, undefined, deps.setProgress)
    expect(deps.setProgress).toHaveBeenCalledWith(0)
    expect(deps.remove).toHaveBeenCalledWith('banner')
    expect(deps.keepMedia).toHaveBeenCalledTimes(2)
    expect(deps.update).toHaveBeenCalledOnce()
    expect(state.saved.display_name).toBe('Ana Nova')
    expect(deps.setProgress).toHaveBeenLastCalledWith(null)
  })

  it('falha no meio: o que já foi sai do rascunho e o erro sobe', async () => {
    const draft: ProfileDraft = {
      ...draftFromProfile(user()),
      avatar: { kind: 'remove' },
      banner: { kind: 'set', file: new Blob(['y']), previewUrl: 'blob:2', animated: false }
    }
    const { deps, state } = setup(draft)
    deps.upload = vi.fn(async () => {
      throw new Error('caiu')
    })
    await expect(saveProfile(deps)).rejects.toThrow('caiu')
    expect(state.draft.avatar.kind).toBe('keep')
    expect(state.draft.banner.kind).toBe('set')
    expect(deps.setProgress).toHaveBeenLastCalledWith(null)
  })
})

describe('previewMedia / saveErrorMessage', () => {
  it('rascunho por cima do salvo', () => {
    expect(previewMedia({ kind: 'keep' }, '/s.png')).toBe('/s.png')
    expect(previewMedia({ kind: 'keep' }, undefined)).toBeNull()
    expect(previewMedia({ kind: 'remove' }, '/s.png')).toBeNull()
    expect(
      previewMedia({ kind: 'set', file: new Blob(), previewUrl: 'blob:p', animated: false }, null)
    ).toBe('blob:p')
  })
  it('mensagem do erro', () => {
    expect(saveErrorMessage(new Error('x'))).toBe('x')
    expect(saveErrorMessage('?')).toBe('Não foi possível salvar o perfil.')
  })
})
