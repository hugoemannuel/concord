import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)

import { useInvitePreviewCache } from '../store/invitePreviewCacheStore'
import { useServerStore } from '../store/serverStore'
import { useAuthStore } from '../../auth/store/authStore'
import MessageInviteEmbeds from './ServerInviteEmbed'

const LINK = 'https://app-salinha.bhrx.com.br/convite/ABCD1234'
const preview = { name: 'Salinha', member_count: 12, online_count: 3, server_id: 's1' }

function render(content: string, isMine = false): string {
  return renderToStaticMarkup(<MessageInviteEmbeds content={content} authorId={isMine ? 'eu' : 'ana'} />)
}

describe('MessageInviteEmbeds', () => {
  beforeEach(() => {
    useServerStore.setState({ servers: [] })
    useAuthStore.setState({ user: { id: 'eu' } as never })
    useInvitePreviewCache.setState({
      entries: { ABCD1234: { status: 'ready', preview } },
      ensure: vi.fn()
    })
  })

  it('mensagem sem convite: nada', () => {
    expect(render('oi, tudo bem? https://google.com')).toBe('')
  })

  it('convite: nome, contagens e Entrar', () => {
    const html = render(`bora ${LINK}`)
    expect(html).toContain('Você foi convidado(a) para entrar num servidor')
    expect(html).toContain('Salinha')
    expect(html).toContain('3 online')
    expect(html).toContain('12 membros')
    expect(html).toContain('>Entrar</button>')
  })

  it('quem mandou vê "Você enviou"', () => {
    expect(render(LINK, true)).toContain('Você enviou um convite para um servidor')
  })

  it('já é membro: Ir para o servidor', () => {
    useServerStore.setState({ servers: [{ id: 's1' }] as never })
    expect(render(LINK)).toContain('>Ir para o servidor</button>')
  })

  it('convite inválido: aviso, sem botão', () => {
    useInvitePreviewCache.setState({
      entries: { ABCD1234: { status: 'error', message: 'Este convite expirou.', retry: false } }
    })
    const html = render(LINK)
    expect(html).toContain('Convite inválido')
    expect(html).toContain('Este convite expirou.')
    expect(html).not.toContain('</button>')
  })

  it('carregando: esqueleto com aviso para leitor de tela', () => {
    useInvitePreviewCache.setState({ entries: {} })
    expect(render(LINK)).toContain('Carregando convite')
  })
})
