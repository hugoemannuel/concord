import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sem DOM: o portal do diálogo vira o próprio conteúdo.
vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  createPortal: (node: React.ReactNode) => node
}))

// No render estático o zustand usa o estado inicial (snapshot do servidor):
// os stores viram seletores sobre um estado que o teste controla.
const fake = vi.hoisted(() => ({
  user: null as { id: string } | null,
  entries: {} as Record<string, unknown>
}))
vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: (select: (s: { user: { id: string } | null }) => unknown) => select({ user: fake.user })
}))
vi.mock('../store/linkPreviewStore', () => ({
  useLinkPreviewStore: Object.assign(
    (select: (s: { entries: Record<string, unknown> }) => unknown) => select({ entries: fake.entries }),
    { getState: () => ({ ensure: () => {}, removeEmbeds: async () => {} }) }
  )
}))

import { renderToStaticMarkup } from 'react-dom/server'
import type { Message } from '../../chat/api/messages'
import MessageEmbeds from './MessageEmbeds'
import RemoveEmbedsDialog from './RemoveEmbedsDialog'

const message = (extra: Partial<Message> = {}): Message => ({
  id: 'm1',
  author_id: 'ana',
  channel_id: 'ch1',
  content: 'olha https://www.buser.com.br/',
  created_at: '2026-11-07T12:00:00Z',
  ...extra
})

function signIn(id: string): void {
  fake.user = { id }
}

describe('MessageEmbeds', () => {
  beforeEach(() => {
    fake.entries = {
      'https://www.buser.com.br/': {
        status: 'ready',
        preview: { url: 'https://www.buser.com.br/', title: 'Passagens de ônibus' }
      }
    }
  })

  it('mostra o cartão do link já carregado', () => {
    signIn('bia')
    expect(renderToStaticMarkup(<MessageEmbeds message={message()} />)).toContain('Passagens de ônibus')
  })

  it('o X de remover é só do autor', () => {
    signIn('bia')
    expect(renderToStaticMarkup(<MessageEmbeds message={message()} />)).not.toContain('Remover prévias')
    signIn('ana')
    expect(renderToStaticMarkup(<MessageEmbeds message={message()} />)).toContain('aria-label="Remover prévias"')
  })

  it('mensagem com as prévias removidas não mostra cartão', () => {
    signIn('ana')
    expect(renderToStaticMarkup(<MessageEmbeds message={message({ embeds_suppressed: true })} />)).toBe('')
  })

  it('carregando ou sem prévia: nada aparece', () => {
    signIn('ana')
    fake.entries = { 'https://www.buser.com.br/': { status: 'loading' } }
    expect(renderToStaticMarkup(<MessageEmbeds message={message()} />)).toBe('')
  })
})

describe('RemoveEmbedsDialog', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { body: {} })
  })

  it('confirma com os textos aprovados', () => {
    const html = renderToStaticMarkup(
      <RemoveEmbedsDialog open busy={false} onCancel={() => {}} onConfirm={() => {}} />
    )
    expect(html).toContain('Remover prévias?')
    expect(html).toContain('As prévias de link desta mensagem somem para todo mundo.')
    expect(html).toContain('Cancelar')
    expect(html).toContain('Remover')
  })
})
