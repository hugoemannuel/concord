import { describe, expect, it, vi } from 'vitest'
import { removeServerProfile, resetServerField, type ServerResetDeps } from './serverProfileResets'
import type { ServerProfileView } from './serverProfile'

const viewOf = (over: Partial<ServerProfileView> = {}): ServerProfileView => ({
  server_id: 's1',
  user_id: 'u1',
  profile: {},
  has_profile: false,
  nickname: null,
  can_change_nickname: true,
  ...over
})

function deps(view = viewOf()): ServerResetDeps {
  return {
    view: () => view,
    patch: vi.fn(() => Promise.resolve(viewOf())),
    resetImage: vi.fn(() => Promise.resolve(viewOf())),
    deleteProfile: vi.fn(() => Promise.resolve(viewOf())),
    setNickname: vi.fn(() => Promise.resolve())
  }
}

describe('resetServerField', () => {
  it('campo simples: null só nele', async () => {
    const d = deps()
    await resetServerField('bio', d)
    expect(d.patch).toHaveBeenCalledWith({ bio: null })
    expect(d.setNickname).not.toHaveBeenCalled()
  })

  it('nome: tira o apelido e o estilo', async () => {
    const d = deps(viewOf({ nickname: 'Aninha' }))
    await resetServerField('name', d)
    expect(d.setNickname).toHaveBeenCalledWith('')
    expect(d.patch).toHaveBeenCalledWith({ name_style: null })
  })

  it('nome sem CHANGE_NICKNAME: o apelido imposto fica, só o estilo sai', async () => {
    const d = deps(viewOf({ nickname: 'Imposto', can_change_nickname: false }))
    await resetServerField('name', d)
    expect(d.setNickname).not.toHaveBeenCalled()
    expect(d.patch).toHaveBeenCalledWith({ name_style: null })
  })

  it('faixa e moldura: as duas imagens e o modo', async () => {
    const d = deps()
    await resetServerField('cosmetics', d)
    expect(d.resetImage).toHaveBeenCalledWith('nameplate')
    expect(d.resetImage).toHaveBeenCalledWith('decoration')
    expect(d.patch).toHaveBeenCalledWith({ nameplate_mode: null })
  })
})

describe('removeServerProfile', () => {
  it('apaga o perfil e o apelido', async () => {
    const d = deps(viewOf({ nickname: 'Aninha', has_profile: true }))
    await removeServerProfile(d)
    expect(d.setNickname).toHaveBeenCalledWith('')
    expect(d.deleteProfile).toHaveBeenCalled()
  })

  it('sem CHANGE_NICKNAME apaga o perfil e o apelido imposto fica', async () => {
    const d = deps(viewOf({ nickname: 'Imposto', can_change_nickname: false, has_profile: true }))
    await removeServerProfile(d)
    expect(d.setNickname).not.toHaveBeenCalled()
    expect(d.deleteProfile).toHaveBeenCalled()
  })
})
