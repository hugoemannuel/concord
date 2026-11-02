import { beforeEach, describe, expect, it } from 'vitest'
import type { Channel } from '../api/channels'
import { useChannelSidebarStore } from './channelSidebarStore'

const voice = { id: 'v1', name: 'resenha', type: 'voice' } as Channel

describe('channelSidebarStore', () => {
  beforeEach(() =>
    useChannelSidebarStore.setState({
      menuFor: null,
      form: null,
      deleting: null,
      permissionsFor: null,
      confirm: null
    })
  )

  it('o "•••" alterna o menu do canal', () => {
    const s = useChannelSidebarStore.getState()
    s.toggleMenu('c1')
    expect(useChannelSidebarStore.getState().menuFor).toBe('c1')
    s.toggleMenu('c1')
    expect(useChannelSidebarStore.getState().menuFor).toBeNull()
    s.openMenu('c2')
    s.closeMenu()
    expect(useChannelSidebarStore.getState().menuFor).toBeNull()
  })

  it('cada abertura do formulário é uma sessão nova', () => {
    const s = useChannelSidebarStore.getState()
    s.openCreate('voice')
    const first = useChannelSidebarStore.getState().form
    expect(first).toMatchObject({ editing: null, type: 'voice' })
    s.openMenu('v1')
    s.openEdit(voice)
    const second = useChannelSidebarStore.getState()
    expect(second.form).toMatchObject({ editing: voice, type: 'voice' })
    expect(second.form?.session).not.toBe(first?.session)
    expect(second.menuFor).toBeNull()
    s.closeForm()
    expect(useChannelSidebarStore.getState().form).toBeNull()
  })

  it('apagar e permissões fecham o menu', () => {
    const s = useChannelSidebarStore.getState()
    s.openMenu('v1')
    s.askDelete(voice)
    expect(useChannelSidebarStore.getState()).toMatchObject({ menuFor: null, deleting: voice })
    s.cancelDelete()
    s.openMenu('v1')
    s.openPermissions(voice)
    expect(useChannelSidebarStore.getState()).toMatchObject({
      menuFor: null,
      permissionsFor: voice
    })
    s.closePermissions()
    expect(useChannelSidebarStore.getState()).toMatchObject({
      deleting: null,
      permissionsFor: null
    })
  })

  it('abre a criação na categoria escolhida sem reutilizar a seleção no próximo formulário', () => {
    const s = useChannelSidebarStore.getState()
    s.openCreate('text', 'jogos')
    expect(useChannelSidebarStore.getState().form).toMatchObject({ editing: null, type: 'text', categoryId: 'jogos' })
    s.closeForm()
    s.openCreate('voice')
    expect(useChannelSidebarStore.getState().form?.categoryId).toBeUndefined()
  })

  it('confirmações de sair e apagar o servidor', () => {
    const s = useChannelSidebarStore.getState()
    s.openConfirm('leave')
    expect(useChannelSidebarStore.getState().confirm).toBe('leave')
    s.closeConfirm()
    expect(useChannelSidebarStore.getState().confirm).toBeNull()
  })
})
