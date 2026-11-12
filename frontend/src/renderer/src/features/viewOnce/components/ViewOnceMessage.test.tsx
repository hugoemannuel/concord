import { describe, expect, it, vi } from 'vitest'

vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: (sel: (s: { user: { id: string } }) => unknown) => sel({ user: { id: 'me' } })
}))
vi.mock('../../call/store/callStore', () => ({
  useCallStore: (sel: (s: { isScreenSharing: boolean }) => unknown) => sel({ isScreenSharing: false })
}))

import { renderToStaticMarkup } from 'react-dom/server'
import type { Message } from '../../chat/api/messages'
import ViewOnceMessage from './ViewOnceMessage'

const msg = (authorId: string, over = {}): Message =>
  ({
    author_id: authorId,
    view_once: { id: 'a', kind: 'image', gone: false, viewer_ids: [], recipient_ids: ['me'], recipient_count: 1, ...over }
  }) as unknown as Message

describe('ViewOnceMessage', () => {
  it('destinatário: botão "Foto"', () => {
    const html = renderToStaticMarkup(<ViewOnceMessage message={msg('outro')} />)
    expect(html).toContain('<button')
    expect(html).toContain('Foto')
  })

  it('autor: texto "Foto de visualização única"', () => {
    const html = renderToStaticMarkup(<ViewOnceMessage message={msg('me')} />)
    expect(html).not.toContain('<button')
    expect(html).toContain('Foto de visualização única')
  })

  it('quem entrou no grupo depois: texto sem botão', () => {
    const html = renderToStaticMarkup(
      <ViewOnceMessage message={msg('outro', { recipient_ids: ['b', 'c'], recipient_count: 2 })} />
    )
    expect(html).not.toContain('<button')
    expect(html).toContain('Foto de visualização única')
    expect(html).not.toContain('Vista por')
  })

  it('sem view_once, não desenha nada', () => {
    const html = renderToStaticMarkup(
      <ViewOnceMessage message={{ author_id: 'x' } as unknown as Message} />
    )
    expect(html).toBe('')
  })
})
