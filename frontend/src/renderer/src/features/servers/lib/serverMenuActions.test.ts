import { describe, expect, it, vi } from 'vitest'
import { buildServerMenuActions, type ServerMenuDeps } from './serverMenuActions'

function deps(over: Partial<ServerMenuDeps> = {}): ServerMenuDeps {
  return {
    server: { id: 'clicado', name: 'Servidor Clicado' },
    user: { id: 'eu', username: 'eu', display_name: 'Eu' },
    members: [{ server_id: 'clicado', user_id: 'eu', role: 'member', nickname: 'Apelido lá' }],
    // O servidor aberto é outro: onServer só roda depois de abrir o clicado.
    onServer: vi.fn(),
    askConfirm: vi.fn(),
    askCategory: vi.fn(),
    openCard: vi.fn(),
    openLevel: vi.fn(),
    openEvents: vi.fn(),
    openNotify: vi.fn(),
    openMemberProfile: vi.fn(),
    askNickname: vi.fn(),
    markRead: vi.fn(),
    openInvite: vi.fn(),
    openSettings: vi.fn(),
    openCreateChannel: vi.fn(),
    toggleHideMuted: vi.fn(),
    ...over
  }
}

describe('buildServerMenuActions: age no servidor clicado', () => {
  it('perfil, nível, notificações e perfil por servidor recebem o id clicado', () => {
    const d = deps()
    const a = buildServerMenuActions(d)
    a.profile()
    a.level()
    a.notifications()
    a.memberProfile()
    expect(d.openCard).toHaveBeenCalledWith('clicado')
    expect(d.openLevel).toHaveBeenCalledWith('clicado')
    expect(d.openNotify).toHaveBeenCalledWith({ serverId: 'clicado', name: 'Servidor Clicado' })
    expect(d.openMemberProfile).toHaveBeenCalledWith('clicado')
  })

  it('o apelido usa o membro do servidor clicado, não o do aberto', () => {
    const d = deps()
    buildServerMenuActions(d).nickname()
    expect(d.askNickname).toHaveBeenCalledWith({
      serverId: 'clicado',
      userId: 'eu',
      name: 'Apelido lá',
      nickname: 'Apelido lá',
      displayName: 'Eu',
      self: true
    })
  })

  it('marcar como lido recebe o id clicado', () => {
    const d = deps()
    buildServerMenuActions(d).markRead()
    expect(d.markRead).toHaveBeenCalledWith('clicado')
  })

  it('convidar, configurações, criar canal e eventos esperam o servidor abrir (onServer)', () => {
    const d = deps()
    const a = buildServerMenuActions(d)
    a.invite()
    a.settings()
    a.createChannel()
    a.events()
    expect(d.onServer).toHaveBeenCalledTimes(4)
    expect(d.openEvents).not.toHaveBeenCalled()
    // Nada abriu ainda: só quando onServer decide rodar.
    expect(d.openInvite).not.toHaveBeenCalled()
    expect(d.openSettings).not.toHaveBeenCalled()
    expect(d.openCreateChannel).not.toHaveBeenCalled()
  })

  it('o que onServer roda abre o diálogo certo', () => {
    const d = deps({ onServer: vi.fn((run: () => void) => run()) })
    const a = buildServerMenuActions(d)
    a.invite()
    a.settings()
    a.createChannel()
    a.events()
    expect(d.openEvents).toHaveBeenCalledWith('clicado')
    expect(d.openInvite).toHaveBeenCalledOnce()
    expect(d.openSettings).toHaveBeenCalledWith(undefined)
    expect(d.openCreateChannel).toHaveBeenCalledWith('text')
  })

  it('seção das configurações escolhida no submenu', () => {
    const d = deps({ onServer: vi.fn((run: () => void) => run()) })
    buildServerMenuActions(d).openSettingsSection('roles')
    expect(d.openSettings).toHaveBeenCalledWith('roles')
  })

  it('sair, apagar e criar categoria pedem no servidor clicado', () => {
    const d = deps()
    const a = buildServerMenuActions(d)
    a.leave()
    a.delete()
    a.createCategory()
    expect(d.askConfirm).toHaveBeenNthCalledWith(1, 'leave')
    expect(d.askConfirm).toHaveBeenNthCalledWith(2, 'delete-server')
    expect(d.askCategory).toHaveBeenCalledOnce()
  })

  it('sem usuário ou sem servidor, apelido não faz nada', () => {
    const d = deps({ user: undefined })
    buildServerMenuActions(d).nickname()
    expect(d.askNickname).not.toHaveBeenCalled()
  })

  it('ocultar silenciados liga no servidor clicado, para a pessoa do menu', () => {
    const d = deps()
    buildServerMenuActions(d).hideMuted()
    expect(d.toggleHideMuted).toHaveBeenCalledWith(d.user?.id, d.server.id)
  })
})
