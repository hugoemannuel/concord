import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../../../shared/lib/config', () => ({ API_BASE_URL: 'https://api' }))
vi.mock('../../../shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../shared/api/client')>()),
  request: api.request
}))

import { ApiError } from '../../../shared/api/client'
import {
  cancelEvent,
  clearRsvp,
  fetchEventAccess,
  fetchRoleSettings,
  saveRoleActions,
  createEvent,
  eventBannerUrl,
  fetchEvents,
  fetchGoing,
  setRsvp,
  updateEvent,
  uploadEventBanner,
  type EventInput
} from './events'

const input: EventInput = {
  title: 'Noite',
  description: '',
  banner_id: null,
  starts_at: '2026-12-01T20:00:00.000Z',
  duration_minutes: 120,
  game_name: '',
  recurrence: 'weekly',
  recurrence_until: null,
  recurrence_count: null,
  reminder_offsets: [10, 5]
}

describe('api de eventos', () => {
  beforeEach(() => {
    api.request.mockReset().mockResolvedValue(undefined)
  })

  it('lista os eventos do servidor', async () => {
    await fetchEvents('s 1')
    expect(api.request).toHaveBeenCalledWith('/servers/s%201/events')
  })

  it('cria e edita com o corpo em JSON', async () => {
    await createEvent('s1', input)
    expect(api.request).toHaveBeenLastCalledWith('/servers/s1/events', {
      method: 'POST',
      body: JSON.stringify(input)
    })
    await updateEvent('s1', 'e1', input)
    expect(api.request).toHaveBeenLastCalledWith('/servers/s1/events/e1', {
      method: 'PATCH',
      body: JSON.stringify(input)
    })
  })

  it('cancela com DELETE', async () => {
    await cancelEvent('s1', 'e1')
    expect(api.request).toHaveBeenLastCalledWith('/servers/s1/events/e1', { method: 'DELETE' })
  })

  it('responde com PUT {going} e tira a resposta com DELETE', async () => {
    await setRsvp('s1', 'e1', true)
    expect(api.request).toHaveBeenLastCalledWith('/servers/s1/events/e1/rsvp', {
      method: 'PUT',
      body: JSON.stringify({ going: true })
    })
    await clearRsvp('s1', 'e1')
    expect(api.request).toHaveBeenLastCalledWith('/servers/s1/events/e1/rsvp', { method: 'DELETE' })
  })

  it('pergunta o que eu posso fazer com os eventos', async () => {
    await fetchEventAccess('s 1')
    expect(api.request).toHaveBeenCalledWith('/servers/s%201/events/access')
  })

  it('o dono lê e grava a configuração por cargo', async () => {
    await fetchRoleSettings('s1')
    expect(api.request).toHaveBeenLastCalledWith('/servers/s1/events/roles')
    await saveRoleActions('s1', 'r 1', { create: true, edit: false, delete: true })
    expect(api.request).toHaveBeenLastCalledWith('/servers/s1/events/roles/r%201', {
      method: 'PUT',
      body: JSON.stringify({ create: true, edit: false, delete: true })
    })
  })

  it('lista quem vai', async () => {
    await fetchGoing('s1', 'e1')
    expect(api.request).toHaveBeenCalledWith('/servers/s1/events/e1/rsvps')
  })

  it('a URL do banner leva o media token', () => {
    expect(eventBannerUrl('b 1', 't&x')).toBe('https://api/event-banners/b%201?token=t%26x')
  })

  it('envia o banner em multipart, sem limite de tempo, e devolve o id', async () => {
    api.request.mockResolvedValueOnce({ banner_id: 'b1' })
    const id = await uploadEventBanner('s1', new Blob(['x'], { type: 'image/png' }))
    expect(id).toBe('b1')
    const [path, init] = api.request.mock.calls[0]
    expect(path).toBe('/servers/s1/events/banner')
    expect(init).toMatchObject({ method: 'POST', timeoutMs: 0 })
    expect(((init.body as FormData).get('file') as File).name).toBe('banner')
  })

  it('erro do envio passa adiante (com o code); resposta sem id vira ApiError', async () => {
    api.request.mockRejectedValueOnce(new ApiError(415, 'Só imagens PNG, JPEG ou WEBP.', 'unsupported_image'))
    const err = await uploadEventBanner('s1', new Blob(['x'])).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(415)
    expect(err.code).toBe('unsupported_image')
    api.request.mockResolvedValueOnce({})
    await expect(uploadEventBanner('s1', new Blob(['x']))).rejects.toBeInstanceOf(ApiError)
  })
})
