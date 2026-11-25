import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Message } from '../api/messages'
import SystemMessage from './SystemMessage'

vi.mock('../../../app/router', () => ({ default: { navigate: vi.fn(), state: { location: { pathname: '/' } } } }))
vi.mock('../../call/lib/noiseSuppression', () => ({ openMicrophone: vi.fn() }))
vi.mock('../../call/lib/rtc', () => ({}))

const base = {
  id: 'm1',
  channel_id: 'c1',
  author_id: 'bot',
  created_at: '2026-11-25T17:02:00Z'
} as unknown as Message

describe('SystemMessage', () => {
  it('alerta: link clicável e @all em chip', () => {
    const html = renderToStaticMarkup(
      <SystemMessage
        message={{
          ...base,
          system_kind: 'alert',
          mention_everyone: 'all',
          content: '@all Crítico: LiveKit não responde, desde 14:02. https://app.example/observabilidade/servidor'
        }}
      />
    )
    expect(html).toContain('href="https://app.example/observabilidade/servidor"')
    expect(html).toContain('LiveKit não responde')
  })

  it('aniversário segue com o nome do servidor em destaque', () => {
    const html = renderToStaticMarkup(
      <SystemMessage message={{ ...base, system_kind: 'birthday', content: 'O servidor Servidor deseja feliz aniversário!' }} />
    )
    expect(html).toContain('<strong class="font-semibold text-warning">O servidor Servidor</strong>')
  })
})
