import { describe, expect, it, vi } from 'vitest'
import type { NotifySettings } from '../lib/notificationMute'

const state = vi.hoisted(() => ({
  modal: null as { serverId: string; channelId?: string; name: string } | null,
  servers: {} as Record<string, NotifySettings>,
  channels: {} as Record<string, NotifySettings>
}))
vi.mock('../store/notifySettingsStore', () => ({
  useNotifySettingsStore: (select: (s: unknown) => unknown) =>
    select({ ...state, closeModal: vi.fn(), saveServer: vi.fn(), saveChannel: vi.fn() })
}))
vi.mock('../../../shared/ui/Modal', () => ({
  default: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  )
}))

import { renderToStaticMarkup } from 'react-dom/server'
import NotifySettingsModal from './NotifySettingsModal'

const settings = (over: Partial<NotifySettings>): NotifySettings => ({
  muted: false,
  muted_until: null,
  level: 'all',
  suppress_everyone: false,
  ...over
})
const render = (): string => renderToStaticMarkup(<NotifySettingsModal />)

describe('NotifySettingsModal', () => {
  it('fechado: nada', () => {
    state.modal = null
    expect(render()).toBe('')
  })

  it('servidor sem opção salva: padrão, durações de silenciar e o @all', () => {
    state.modal = { serverId: 's1', name: 'Turma' }
    const html = render()
    expect(html).toContain('Notificações — Turma')
    expect(html).toContain('Silenciar servidor')
    expect(html).toContain('Ignorar @all e @here')
    expect(html).not.toContain('usa a opção do servidor')
    expect(html).toMatch(/aria-checked="true"[^>]*>(?:(?!<\/button>).)*Todas as mensagens/)
  })

  it('canal silenciado até reativar: mostra o Reativar e o aviso do canal', () => {
    state.modal = { serverId: 's1', channelId: 'c1', name: 'geral' }
    state.channels = { c1: settings({ muted: true, level: 'mentions' }) }
    const html = render()
    expect(html).toContain('Notificações — #geral')
    expect(html).toContain('Silenciar canal')
    expect(html).toContain('Silenciado até você reativar.')
    expect(html).toContain('Reativar')
    expect(html).toContain('usa a opção do servidor')
    expect(html).not.toContain('Ignorar @all e @here')
  })
})
