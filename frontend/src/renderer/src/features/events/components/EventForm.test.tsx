import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerEvent } from '../api/events'

// Sem DOM: o portal vira o próprio conteúdo.
vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  createPortal: (node: React.ReactNode) => node
}))
vi.mock('../hooks/useBannerSrc', () => ({ useBannerSrc: () => ({ src: null, onError: () => {} }) }))

import { renderToStaticMarkup } from 'react-dom/server'
import EventForm from './EventForm'

const event: ServerEvent = {
  id: 'e1',
  server_id: 's1',
  title: 'Noite de jogos',
  description: 'Traga a galera',
  banner_id: null,
  starts_at: new Date(2099, 10, 4, 20, 0).toISOString(),
  next_start_at: new Date(2099, 10, 4, 20, 0).toISOString(),
  duration_minutes: 180,
  voice_channel_id: null,
  text_channel_id: null,
  recurrence: 'none',
  recurrence_until: null,
  recurrence_count: null,
  reminder_offsets: [30],
  created_by: 'u1',
  going_count: 0,
  my_rsvp: null
}

function render(props: Partial<React.ComponentProps<typeof EventForm>> = {}): string {
  return renderToStaticMarkup(
    <EventForm serverId="s1" onClose={() => {}} onSaved={() => {}} {...props} />
  )
}

describe('EventForm', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { body: {} })
  })

  it('evento novo: título "Novo evento", campos em branco e a duração padrão de 2 horas', () => {
    const html = render()
    expect(html).toContain('Novo evento')
    expect(html).toMatch(/<option[^>]*value="120"[^>]*selected[^>]*>2 horas/)
    expect(html).toContain('Salvar evento')
  })

  it('editar: título "Editar evento" e os dados do evento nos campos', () => {
    const html = render({ event })
    expect(html).toContain('Editar evento')
    expect(html).toContain('value="Noite de jogos"')
    expect(html).toContain('Traga a galera')
    expect(html).toContain('value="2099-11-04T20:00"')
    expect(html).toMatch(/<option[^>]*value="180"[^>]*selected[^>]*>3 horas/)
  })

  it('tem os campos do pedido: título, descrição, canal, início, repetição, avisos e banner', () => {
    const html = render()
    for (const label of ['Título', 'Descrição', 'Quando começa', 'Duração', 'Repetir', 'Avisar antes', 'Banner']) {
      expect(html).toContain(label)
    }
  })

  it('o campo de início usa data e hora e respeita o limite de tamanho do título', () => {
    const html = render()
    expect(html).toContain('type="datetime-local"')
    expect(html).toContain('maxLength="100"')
  })

  it('explica que a sala própria abre na hora e quem entra', () => {
    const html = render()
    expect(html).toContain('A sala de voz e a de texto do evento abrem na hora de começar')
    expect(html).toContain('só quem confirmar presença entra')
  })

  const tag = (html: string, name: string): string => {
    const match = new RegExp(`<(?:input|select)[^>]*name="${name}"[^>]*>`).exec(html)
    if (!match) throw new Error(`sem campo ${name}`)
    return match[0]
  }

  it('antes de começar, todos os campos estão liberados', () => {
    const html = render({ event })
    expect(html).not.toContain('O evento está em andamento')
    for (const name of ['event-starts-at', 'event-duration', 'event-recurrence']) {
      expect(tag(html, name)).not.toContain('disabled')
    }
    expect(html).not.toMatch(/<input[^>]*type="checkbox"[^>]*disabled/)
  })

  it('em andamento, só título, descrição e banner mudam: o resto fica travado e explicado', () => {
    const running = { ...event, next_start_at: new Date(Date.now() - 10 * 60_000).toISOString() }
    const html = render({ event: running })
    expect(html).toContain('O evento está em andamento: só dá para mudar título, descrição e banner.')
    for (const name of ['event-starts-at', 'event-duration', 'event-recurrence']) {
      expect(tag(html, name)).toContain('disabled')
    }
    expect(html.match(/<input[^>]*type="checkbox"[^>]*disabled/g)).toHaveLength(6)
    expect(tag(html, 'event-title')).not.toContain('disabled')
    expect(html).toContain('Traga a galera')
  })
})
