import { describe, expect, it } from 'vitest'
import type { Message } from '../api/messages'
import { compareMessages, compareTimestamps, mergeMessages } from './messageOrder'

function msg(id: string, created_at: string, content = id): Message {
  return { id, author_id: 'a', conversation_id: 'c', content, created_at }
}

const ids = (list: Message[]): string[] => list.map((m) => m.id)

describe('compareTimestamps', () => {
  it('compara o instante, não o texto, com frações de tamanhos diferentes', () => {
    // Como texto, "…00.12Z" > "…00.123456Z" ('Z' > '3'); no tempo é antes.
    expect(
      compareTimestamps('2026-10-25T12:00:00.12Z', '2026-10-25T12:00:00.123456Z')
    ).toBeLessThan(0)
    expect(compareTimestamps('2026-10-25T12:00:00Z', '2026-10-25T12:00:00.000001Z')).toBeLessThan(0)
  })

  it('distingue microssegundos dentro do mesmo milissegundo', () => {
    expect(
      compareTimestamps('2026-10-25T12:00:00.123001Z', '2026-10-25T12:00:00.123002Z')
    ).toBeLessThan(0)
    expect(compareTimestamps('2026-10-25T12:00:00.1230Z', '2026-10-25T12:00:00.123Z')).toBe(0)
  })

  it('respeita o fuso', () => {
    // 09:30-03:00 = 12:30Z, depois de 12:00Z mesmo "parecendo" antes.
    expect(compareTimestamps('2026-10-25T09:30:00-03:00', '2026-10-25T12:00:00Z')).toBeGreaterThan(
      0
    )
    expect(compareTimestamps('2026-10-25T09:00:00.5-03:00', '2026-10-25T12:00:00.5Z')).toBe(0)
  })
})

describe('compareMessages', () => {
  it('desempata o mesmo created_at pelo id, como o backend', () => {
    const t = '2026-10-25T12:00:00.000001Z'
    expect(compareMessages(msg('b', t), msg('a', t))).toBeGreaterThan(0)
    expect(compareMessages(msg('a', t), msg('a', t))).toBe(0)
  })
})

describe('mergeMessages', () => {
  const m1 = msg('f1', '2026-10-25T12:00:01Z')
  const m2 = msg('0a', '2026-10-25T12:00:02Z')
  const m3 = msg('c3', '2026-10-25T12:00:03Z')
  const m4 = msg('11', '2026-10-25T12:00:04Z')

  it('página da API (mais nova primeiro) vira lista em ordem', () => {
    expect(ids(mergeMessages([], [m4, m3, m2, m1]))).toEqual(['f1', '0a', 'c3', '11'])
  })

  it('mensagem ao vivo já na lista antes da página inicial vai para o fim', () => {
    expect(ids(mergeMessages([m4], [m3, m2, m1]))).toEqual(['f1', '0a', 'c3', '11'])
  })

  it('mensagem ao vivo repetida na página inicial não duplica', () => {
    expect(ids(mergeMessages([m4], [m4, m3, m2]))).toEqual(['0a', 'c3', '11'])
  })

  it('página antiga entra antes, mesmo com sobreposição de mensagens novas', () => {
    expect(ids(mergeMessages([m3, m4], [m4, m2, m1]))).toEqual(['f1', '0a', 'c3', '11'])
  })

  it('evento ao vivo fora de ordem (chegou antes de um anterior) fica no lugar certo', () => {
    expect(ids(mergeMessages([m1, m2, m4], [m3]))).toEqual(['f1', '0a', 'c3', '11'])
  })

  it('evento repetido (sala do canal e do servidor) entra uma vez', () => {
    expect(ids(mergeMessages(mergeMessages([m1], [m2]), [m2]))).toEqual(['f1', '0a'])
  })

  it('duplicata fica com a cópia mais nova, na posição da ordem', () => {
    const edited = { ...m2, content: 'novo' }
    const merged = mergeMessages([m1, m2, m3], [edited])
    expect(ids(merged)).toEqual(['f1', '0a', 'c3'])
    expect(merged[1].content).toBe('novo')
  })

  it('ordem é a mesma qualquer que seja a ordem de chegada', () => {
    const all = [m1, m2, m3, m4]
    const orders = [
      [m4, m1, m3, m2],
      [m2, m4, m1, m3],
      [m3, m2, m4, m1]
    ]
    for (const order of orders) {
      const oneByOne = order.reduce<Message[]>((acc, m) => mergeMessages(acc, [m]), [])
      expect(ids(oneByOne)).toEqual(ids(all))
    }
  })

  it('sem nada novo devolve a mesma lista (sem re-render à toa)', () => {
    const list = [m1, m2]
    expect(mergeMessages(list, [])).toBe(list)
  })

  it('mensagem ao vivo mais nova que a última entra no fim, sem mexer nas outras', () => {
    const list = [m1, m2]
    const merged = mergeMessages(list, [m3])
    expect(ids(merged)).toEqual(['f1', '0a', 'c3'])
    expect(merged[0]).toBe(m1)
    expect(merged[2]).toBe(m3)
    expect(list).toHaveLength(2)
  })

  it('primeira mensagem numa sala vazia', () => {
    expect(ids(mergeMessages([], [m1]))).toEqual(['f1'])
  })

  it('mesmo created_at da última: o id desempata (antes ou depois dela)', () => {
    const t = m2.created_at
    expect(ids(mergeMessages([m1, m2], [msg('ff', t)]))).toEqual(['f1', '0a', 'ff'])
    expect(ids(mergeMessages([m1, m2], [msg('00', t)]))).toEqual(['f1', '00', '0a'])
  })

  it('cópia idêntica de uma que já está (canal + servidor) devolve a mesma lista', () => {
    const list = [m1, m2, m3]
    expect(mergeMessages(list, [m2])).toBe(list)
    expect(mergeMessages(list, [{ ...m3 }])).toBe(list)
  })

  it('cópia diferente de uma que já está troca pela nova', () => {
    const list = [m1, m2]
    const merged = mergeMessages(list, [{ ...m2, content: 'editada' }])
    expect(merged).not.toBe(list)
    expect(ids(merged)).toEqual(['f1', '0a'])
    expect(merged[1].content).toBe('editada')
  })

  it('mesmo id com created_at mais novo não duplica: a cópia nova vai para o lugar dela', () => {
    const moved = { ...m1, created_at: '2026-10-25T12:00:09Z' }
    expect(ids(mergeMessages([m1, m2], [moved]))).toEqual(['0a', 'f1'])
  })
})
