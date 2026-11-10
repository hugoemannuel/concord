import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)
// O chatStore puxa o áudio da chamada (AudioWorklet), que não existe no Node.
vi.mock('../../../call/lib/noiseSuppression', () => ({ openMicrophone: vi.fn() }))
vi.mock('../../../call/lib/rtc', () => ({}))
vi.mock('../../../../app/router', () => ({
  default: { navigate: vi.fn(), state: { location: { pathname: '/' } } }
}))

import type { Message } from '../../api/messages'
import { useForwardStore } from '../../store/forwardStore'
import ForwardMessageModal, { ForwardPreview } from './ForwardMessageModal'

const message: Message = {
  id: 'm1',
  author_id: 'ana',
  author: { id: 'ana', username: 'ana', display_name: 'Ana' },
  channel_id: 'c1',
  content: 'olha **isso**',
  created_at: '2026-11-09T12:00:00Z'
}

describe('ForwardPreview', () => {
  it('quem escreveu e a prévia do texto', () => {
    const html = renderToStaticMarkup(<ForwardPreview message={message} />)
    expect(html).toContain('Ana')
    expect(html).toContain('olha isso')
  })

  it('sem autor carregado: "Alguém"', () => {
    expect(renderToStaticMarkup(<ForwardPreview message={{ ...message, author: undefined }} />)).toContain('Alguém')
  })
})

describe('ForwardMessageModal', () => {
  it('fechado enquanto nenhuma mensagem está sendo encaminhada', () => {
    useForwardStore.getState().close()
    expect(renderToStaticMarkup(<ForwardMessageModal />)).toBe('')
  })

  it('o store abre e fecha com a mensagem', () => {
    useForwardStore.getState().open(message)
    expect(useForwardStore.getState().message?.id).toBe('m1')
    useForwardStore.getState().close()
    expect(useForwardStore.getState().message).toBeNull()
  })
})
