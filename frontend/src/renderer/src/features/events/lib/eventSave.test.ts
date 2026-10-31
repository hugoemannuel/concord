import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import type { ServerEvent } from '../api/events'
import { emptyForm, type EventFormValues } from './eventForm'
import { saveEvent } from './eventSave'

const saved = { id: 'e1', title: 'Noite' } as ServerEvent
const existing = { id: 'e1' } as ServerEvent

function valid(extra: Partial<EventFormValues> = {}): EventFormValues {
  const future = new Date(Date.now() + 48 * 3600 * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const startsAt = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T20:00`
  return { ...emptyForm(), title: 'Noite', startsAt, ...extra }
}

function actions() {
  return { create: vi.fn().mockResolvedValue(saved), update: vi.fn().mockResolvedValue(saved) }
}

describe('saveEvent', () => {
  it('formulário inválido devolve o erro e não chama a API', async () => {
    const api = actions()
    const result = await saveEvent('s1', undefined, valid({ title: '  ' }), api)
    expect(result).toEqual({ ok: false, error: 'Dê um título ao evento.' })
    expect(api.create).not.toHaveBeenCalled()
  })

  it('evento novo: cria', async () => {
    const api = actions()
    expect(await saveEvent('s1', undefined, valid(), api)).toEqual({ ok: true, event: saved })
    expect(api.create).toHaveBeenCalledOnce()
    expect(api.create.mock.calls[0][0]).toBe('s1')
    expect(api.update).not.toHaveBeenCalled()
  })

  it('evento existente: edita pelo id', async () => {
    const api = actions()
    await saveEvent('s1', existing, valid(), api)
    expect(api.update).toHaveBeenCalledOnce()
    expect(api.update.mock.calls[0].slice(0, 2)).toEqual(['s1', 'e1'])
    expect(api.create).not.toHaveBeenCalled()
  })

  it('recusa do servidor vira a mensagem dele; outros erros, a genérica', async () => {
    const refused = { create: vi.fn().mockRejectedValue(new ApiError(403, 'sem permissão', 'missing_permission')), update: vi.fn() }
    expect(await saveEvent('s1', undefined, valid(), refused)).toEqual({ ok: false, error: 'sem permissão' })
    const broken = { create: vi.fn().mockRejectedValue(new Error('rede')), update: vi.fn() }
    expect(await saveEvent('s1', undefined, valid(), broken)).toEqual({
      ok: false,
      error: 'Não foi possível salvar. Tente de novo.'
    })
  })
})
