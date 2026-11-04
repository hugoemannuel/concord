import { describe, expect, it, vi } from 'vitest'
import type { User } from '../../auth/store/authStore'
import { applyServerProfileChange, type ServerApplyDeps } from './serverProfileApply'
import type { ServerProfileView } from './serverProfile'

const user = {
  id: 'u1',
  username: 'ana',
  display_name: 'Ana',
  pronouns: 'ela',
  bio: 'global',
  status_text: '',
  links: [],
  banner_color: null
} as unknown as User

const viewOf = (over: Partial<ServerProfileView> = {}): ServerProfileView => ({
  server_id: 's1',
  user_id: 'u1',
  profile: {},
  has_profile: false,
  nickname: null,
  can_change_nickname: true,
  ...over
})

function setup(view = viewOf()) {
  let current = view
  const answer = (next: Partial<ServerProfileView> = {}) => Promise.resolve(viewOf({ ...current, ...next }))
  const deps: ServerApplyDeps = {
    user: () => user,
    view: () => current,
    upload: vi.fn(() => answer({ has_profile: true })),
    reset: vi.fn(() => answer()),
    patch: vi.fn(() => answer({ has_profile: true })),
    setNickname: vi.fn((nick: string) => Promise.resolve(nick || null)),
    commit: vi.fn((next: ServerProfileView) => {
      current = next
    }),
    setProgress: vi.fn()
  }
  const notify = { success: vi.fn(), error: vi.fn() }
  return { deps, notify, current: () => current }
}

describe('applyServerProfileChange', () => {
  it('aplicar sem mexer em nada não cria perfil', async () => {
    const { deps, notify } = setup()
    const ok = await applyServerProfileChange(
      { fields: { bio: 'global', pronouns: 'ela', display_name: 'Ana' } },
      deps,
      notify
    )
    expect(ok).toBe(true)
    expect(deps.patch).not.toHaveBeenCalled()
    expect(deps.setNickname).not.toHaveBeenCalled()
  })

  it('só o que mudou vai no PATCH', async () => {
    const { deps, notify } = setup()
    await applyServerProfileChange({ fields: { bio: '  aqui  ', pronouns: 'ela' } }, deps, notify)
    expect(deps.patch).toHaveBeenCalledWith({ bio: 'aqui' })
    expect(notify.success).toHaveBeenCalledWith('Perfil do servidor salvo!')
  })

  it('voltar ao valor global é herdar (null)', async () => {
    const { deps, notify } = setup(viewOf({ profile: { bio: 'aqui' }, has_profile: true }))
    await applyServerProfileChange({ fields: { bio: 'global' } }, deps, notify)
    expect(deps.patch).toHaveBeenCalledWith({ bio: null })
  })

  it('nome diferente vira apelido e não vai no PATCH', async () => {
    const { deps, notify, current } = setup()
    await applyServerProfileChange({ fields: { display_name: 'Aninha' } }, deps, notify)
    expect(deps.setNickname).toHaveBeenCalledWith('Aninha')
    expect(deps.patch).not.toHaveBeenCalled()
    expect(current().nickname).toBe('Aninha')
  })

  it('nome igual ao global tira o apelido', async () => {
    const { deps, notify } = setup(viewOf({ nickname: 'Aninha' }))
    await applyServerProfileChange({ fields: { display_name: 'Ana' } }, deps, notify)
    expect(deps.setNickname).toHaveBeenCalledWith('')
  })

  it('apelido novo mantém o estilo que estava na prévia', async () => {
    const style = { font: 'mono', effect: 'none', colors: [] }
    const styled = { ...user, name_style: style } as unknown as User
    const { deps, notify } = setup()
    deps.user = () => styled
    await applyServerProfileChange(
      { fields: { display_name: 'Aninha', name_style: style as never } },
      deps,
      notify
    )
    expect(deps.setNickname).toHaveBeenCalledWith('Aninha')
    expect(deps.patch).toHaveBeenCalledWith({ name_style: expect.objectContaining({ font: 'mono' }) })
  })

  it('tirar o apelido sem mexer no estilo não grava estilo', async () => {
    const styled = { ...user, name_style: { font: 'mono', effect: 'none', colors: [] } } as unknown as User
    const { deps, notify } = setup(viewOf({ nickname: 'Aninha' }))
    deps.user = () => styled
    await applyServerProfileChange(
      { fields: { display_name: 'Ana', name_style: { font: 'default', effect: 'none', colors: [] } as never } },
      deps,
      notify
    )
    expect(deps.setNickname).toHaveBeenCalledWith('')
    expect(deps.patch).not.toHaveBeenCalled()
  })

  it('sem CHANGE_NICKNAME o nome não muda, mas o resto salva', async () => {
    const { deps, notify } = setup(viewOf({ can_change_nickname: false }))
    const ok = await applyServerProfileChange(
      { fields: { display_name: 'Outro', bio: 'aqui' } },
      deps,
      notify
    )
    expect(ok).toBe(true)
    expect(deps.setNickname).not.toHaveBeenCalled()
    expect(deps.patch).toHaveBeenCalledWith({ bio: 'aqui' })
  })

  it('imagem: envia, ou volta ao padrão', async () => {
    const { deps, notify } = setup()
    const file = new Blob(['x'])
    await applyServerProfileChange(
      { avatar: { kind: 'set', file, previewUrl: 'blob:x', animated: false } as never, banner: { kind: 'remove' } },
      deps,
      notify
    )
    expect(deps.upload).toHaveBeenCalledWith('avatar', file, undefined, deps.setProgress)
    expect(deps.reset).toHaveBeenCalledWith('banner')
    expect(deps.patch).not.toHaveBeenCalled()
  })

  it('erro avisa, devolve false e o modal fica aberto', async () => {
    const { deps, notify } = setup()
    deps.patch = vi.fn(() => Promise.reject(new Error('banco fora')))
    const ok = await applyServerProfileChange({ fields: { bio: 'aqui' } }, deps, notify)
    expect(ok).toBe(false)
    expect(notify.error).toHaveBeenCalledWith('banco fora')
    expect(deps.setProgress).toHaveBeenLastCalledWith(null)
  })
})
