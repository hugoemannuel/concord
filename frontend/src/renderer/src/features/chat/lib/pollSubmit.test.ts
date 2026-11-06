import { describe, expect, it, vi } from 'vitest'
import { submitPoll } from './pollSubmit'
import { pollDraftToInput, type PollDraft } from './polls'

const draft: PollDraft = {
  question: 'Pizza?',
  answers: [
    { text: 'Sim', emoji: '', image_url: '' },
    { text: 'Não', emoji: '', image_url: '' }
  ],
  duration_hours: 24,
  allow_multiselect: false
}

describe('submitPoll', () => {
  it('cria com o rascunho convertido e fecha', async () => {
    const deps = { create: vi.fn(async () => undefined), done: vi.fn(), error: vi.fn() }
    await submitPoll(deps, draft)
    expect(deps.create).toHaveBeenCalledWith(pollDraftToInput(draft))
    expect(deps.done).toHaveBeenCalled()
    expect(deps.error).not.toHaveBeenCalled()
  })

  it('falha: não fecha e avisa com a mensagem do erro', async () => {
    const deps = {
      create: vi.fn(async () => Promise.reject(new Error('cheia'))),
      done: vi.fn(),
      error: vi.fn()
    }
    await submitPoll(deps, draft)
    expect(deps.done).not.toHaveBeenCalled()
    expect(deps.error).toHaveBeenCalledWith('cheia')
  })

  it('falha sem Error usa o texto padrão', async () => {
    const deps = { create: vi.fn(async () => Promise.reject('x')), done: vi.fn(), error: vi.fn() }
    await submitPoll(deps, draft)
    expect(deps.error).toHaveBeenCalledWith('Falha ao criar a enquete.')
  })
})
