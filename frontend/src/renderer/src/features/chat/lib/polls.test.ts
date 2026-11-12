import { describe, expect, it } from 'vitest'
import type { Attachment, Poll } from '../api/messages'
import {
  applyPollUpdate,
  isPollClosed,
  messagePreview,
  messagePreviewParts,
  pollDraftError,
  pollDraftToInput,
  pollPercent,
  pollTimeLeft,
  pollHint,
  pollWinners,
  votesLabel,
  type PollDraft
} from './polls'

const NOW = new Date('2026-10-24T12:00:00Z').getTime()

function poll(overrides: Partial<Poll> = {}): Poll {
  return {
    question: 'Jantar?',
    answers: [
      { answer_id: 1, text: 'Pizza', emoji: '🍕', count: 2, me_voted: false },
      { answer_id: 2, text: 'Sushi', count: 1, me_voted: true }
    ],
    allow_multiselect: false,
    expires_at: new Date(NOW + 3 * 3_600_000).toISOString(),
    total_voters: 3,
    ...overrides
  }
}

describe('isPollClosed / pollTimeLeft', () => {
  it('aberta mostra quanto falta', () => {
    expect(isPollClosed(poll(), NOW)).toBe(false)
    expect(pollTimeLeft(poll(), NOW)).toBe('Faltam 3 h')
    expect(pollTimeLeft(poll({ expires_at: new Date(NOW + 90_000).toISOString() }), NOW)).toBe(
      'Faltam 2 min'
    )
    expect(
      pollTimeLeft(poll({ expires_at: new Date(NOW + 49 * 3_600_000).toISOString() }), NOW)
    ).toBe('Faltam 2 dias')
  })

  it('encerra pelo prazo ou pelo autor', () => {
    expect(isPollClosed(poll({ expires_at: new Date(NOW).toISOString() }), NOW)).toBe(true)
    expect(isPollClosed(poll({ ended_at: new Date(NOW).toISOString() }), NOW)).toBe(true)
    expect(pollTimeLeft(poll({ ended_at: new Date(NOW).toISOString() }), NOW)).toBe('Encerrada')
  })
})

describe('pollPercent / pollWinners', () => {
  it('arredonda e não divide por zero', () => {
    expect(pollPercent(2, 3)).toBe(67)
    expect(pollPercent(0, 0)).toBe(0)
  })

  it('aponta os mais votados, inclusive empates, e nenhum sem votos', () => {
    expect(pollWinners(poll())).toEqual([1])
    const tie = poll()
    tie.answers[1].count = 2
    expect(pollWinners(tie)).toEqual([1, 2])
    expect(pollWinners(poll({ answers: poll().answers.map((a) => ({ ...a, count: 0 })) }))).toEqual(
      []
    )
  })
})

describe('applyPollUpdate', () => {
  const incoming = poll({
    answers: [
      { answer_id: 1, text: 'Pizza', emoji: '🍕', count: 3, me_voted: false },
      { answer_id: 2, text: 'Sushi', count: 0, me_voted: false }
    ],
    total_voters: 3
  })

  it('voto de outra pessoa: atualiza contagens e mantém o meu me_voted', () => {
    const next = applyPollUpdate(
      poll(),
      { poll: incoming, voter_id: 'outro', voter_answer_ids: [1] },
      'eu'
    )
    expect(next.answers.map((a) => a.count)).toEqual([3, 0])
    expect(next.answers.map((a) => a.me_voted)).toEqual([false, true])
  })

  it('meu voto: me_voted segue o que votei (vazio = removi)', () => {
    const voted = applyPollUpdate(
      poll(),
      { poll: incoming, voter_id: 'eu', voter_answer_ids: [1] },
      'eu'
    )
    expect(voted.answers.map((a) => a.me_voted)).toEqual([true, false])
    const removed = applyPollUpdate(
      poll(),
      { poll: incoming, voter_id: 'eu', voter_answer_ids: [] },
      'eu'
    )
    expect(removed.answers.map((a) => a.me_voted)).toEqual([false, false])
  })
})

describe('messagePreview', () => {
  it('mensagem de enquete mostra a pergunta', () => {
    expect(messagePreview({ content: '', poll: poll() })).toBe('📊 Jantar?')
    expect(messagePreview({ content: 'oi' })).toBe('oi')
  })

  it('mensagem só com anexo mostra o rótulo', () => {
    const audio = [{ kind: 'audio' }] as Attachment[]
    expect(messagePreview({ content: '', poll: null, attachments: audio })).toBe('🎤 Áudio')
    expect(messagePreview({ content: 'olha', poll: null, attachments: audio })).toBe('olha')
    expect(messagePreview({ content: '', poll: poll(), attachments: audio })).toBe('📊 Jantar?')
  })
})

describe('messagePreview com Markdown', () => {
  it('notificação e última mensagem da conversa vêm sem os símbolos e sem o spoiler', () => {
    expect(messagePreview({ content: '**oi** _tudo_ ||bem||?' })).toBe('oi tudo ▮▮▮▮?')
    expect(messagePreviewParts({ content: '> citação' })).toEqual({ icon: null, text: 'citação' })
  })
})

describe('messagePreviewParts (dentro do app: o ícone é desenhado)', () => {
  it('enquete, figurinha, GIF e anexo levam o tipo; o texto vem sem emoji', () => {
    const audio = [{ kind: 'audio' }] as Attachment[]
    expect(messagePreviewParts({ content: '', poll: poll() })).toEqual({ icon: 'poll', text: 'Jantar?' })
    expect(messagePreviewParts({ content: 'oi' })).toEqual({ icon: null, text: 'oi' })
    expect(messagePreviewParts({ content: '', sticker_id: 's' })).toEqual({ icon: 'sticker', text: 'Figurinha' })
    expect(messagePreviewParts({ content: '', deleted_sticker_name: 'gato' })).toEqual({ icon: 'sticker', text: 'Figurinha :gato:' })
    expect(messagePreviewParts({ content: '', gif_url: 'g' })).toEqual({ icon: 'gif', text: 'GIF' })
    expect(messagePreviewParts({ content: '', attachments: audio })).toEqual({ icon: 'audio', text: 'Áudio' })
    expect(messagePreviewParts({ content: '' })).toEqual({ icon: null, text: '' })
  })
})

describe('rascunho da enquete', () => {
  const draft = (overrides: Partial<PollDraft> = {}): PollDraft => ({
    question: ' Jantar? ',
    answers: [
      { text: ' Pizza ', emoji: '🍕', image_url: '' },
      { text: 'Sushi', emoji: '', image_url: 'https://x.com/s.png' },
      { text: '  ', emoji: '', image_url: '' }
    ],
    duration_hours: 24,
    allow_multiselect: false,
    ...overrides
  })

  it('pede pergunta e duas respostas, e imagem https', () => {
    expect(pollDraftError(draft())).toBeNull()
    expect(pollDraftError(draft({ question: ' ' }))).toBe('Escreva a pergunta.')
    expect(pollDraftError(draft({ answers: draft().answers.slice(0, 1) }))).toBe(
      'Preencha pelo menos duas respostas.'
    )
    expect(
      pollDraftError(
        draft({
          answers: [
            { text: 'a', emoji: '', image_url: 'http://x' },
            { text: 'b', emoji: '', image_url: '' }
          ]
        })
      )
    ).toBe('A imagem da resposta precisa ser um link https://.')
  })

  it('monta o corpo sem respostas vazias e sem campos em branco', () => {
    expect(pollDraftToInput(draft())).toEqual({
      question: 'Jantar?',
      answers: [
        { text: 'Pizza', emoji: '🍕' },
        { text: 'Sushi', image_url: 'https://x.com/s.png' }
      ],
      duration_hours: 24,
      allow_multiselect: false
    })
  })
})

describe('votesLabel / pollHint', () => {
  it('singular e plural', () => {
    expect(votesLabel(1)).toBe('1 voto')
    expect(votesLabel(0)).toBe('0 votos')
    expect(votesLabel(3)).toBe('3 votos')
  })

  it('ajuda conforme o estado', () => {
    expect(pollHint(true, true)).toBe('Enquete encerrada')
    expect(pollHint(false, true)).toBe('Selecione uma ou mais respostas')
    expect(pollHint(false, false)).toBe('Selecione uma resposta')
  })
})

describe('prévia da visualização única', () => {
  const once = (kind: 'image' | 'video') => ({
    id: 'a',
    kind,
    gone: false,
    viewer_ids: [],
    recipient_ids: [],
    recipient_count: 1
  })

  it('sem texto, mostra o rótulo aprovado com o ícone do tipo', () => {
    expect(messagePreviewParts({ content: '', view_once: once('image') })).toEqual({
      icon: 'image',
      text: 'Foto de visualização única'
    })
    expect(messagePreviewParts({ content: '', view_once: once('video') })).toEqual({
      icon: 'video',
      text: 'Vídeo de visualização única'
    })
  })

  it('com texto, vale o texto', () => {
    expect(messagePreviewParts({ content: 'oi', view_once: once('image') }).text).toBe('oi')
  })
})
