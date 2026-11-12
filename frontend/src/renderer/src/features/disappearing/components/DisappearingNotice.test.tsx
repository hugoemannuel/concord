import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Message } from '../../chat/api/messages'
import DisappearingNotice from './DisappearingNotice'

const message = {
  id: 'n1',
  content: 'Mensagens temporárias ativadas: 24 horas',
  created_at: '2026-11-12T10:00:00Z',
  system_kind: 'disappearing'
} as Message

describe('DisappearingNotice', () => {
  it('mostra o texto da mensagem, com o horário na dica', () => {
    const html = renderToStaticMarkup(<DisappearingNotice message={message} />)
    expect(html).toContain('Mensagens temporárias ativadas: 24 horas')
    expect(html).toContain('title="')
  })

  it('não mostra o selo "Servidor"', () => {
    expect(renderToStaticMarkup(<DisappearingNotice message={message} />)).not.toContain(
      'Servidor'
    )
  })
})
