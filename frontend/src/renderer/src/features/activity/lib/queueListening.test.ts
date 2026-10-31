import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import { queueButtonLabel, queueListening, QUEUE_ADDING, QUEUE_DONE, QUEUE_FAILED } from './queueListening'

const track = { app: 'Spotify', title: 'Águas de Março', artist: 'Elis Regina', started_at: 1 }

const deps = () => ({ enqueue: vi.fn().mockResolvedValue(undefined), notify: vi.fn() })

describe('queueListening', () => {
  it('manda "artista - título" ao servidor da call e avisa que entrou', async () => {
    const d = deps()
    await queueListening({ serverId: 's1' }, track, d)
    expect(d.enqueue).toHaveBeenCalledWith('s1', 'Elis Regina - Águas de Março')
    expect(d.notify).toHaveBeenCalledWith('success', QUEUE_DONE)
  })

  it('fora de call não chama o servidor', async () => {
    const d = deps()
    await queueListening({ reason: 'Entre numa call' }, track, d)
    expect(d.enqueue).not.toHaveBeenCalled()
    expect(d.notify).not.toHaveBeenCalled()
  })

  it('recusa do Maestro: mostra o texto que o servidor mandou', async () => {
    const d = deps()
    d.enqueue.mockRejectedValue(new ApiError(422, 'Esse vídeo é ao vivo.'))
    await queueListening({ serverId: 's1' }, track, d)
    expect(d.notify).toHaveBeenCalledWith('error', 'Esse vídeo é ao vivo.')
  })

  it('erro sem mensagem: texto padrão', async () => {
    const d = deps()
    d.enqueue.mockRejectedValue('x')
    await queueListening({ serverId: 's1' }, track, d)
    expect(d.notify).toHaveBeenCalledWith('error', QUEUE_FAILED)
  })
})

describe('queueButtonLabel', () => {
  it('"Adicionando…" enquanto o servidor não responde', () => {
    expect(queueButtonLabel(true)).toBe(QUEUE_ADDING)
    expect(queueButtonLabel(false)).toBe('Adicionar à fila do Maestro')
  })
})
