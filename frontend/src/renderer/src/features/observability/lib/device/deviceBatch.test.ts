import { describe, expect, it } from 'vitest'
import { DeviceBatchQueue, MIN_SEND_GAP_MS, type ClosedRow } from './deviceBatch'

const MIN = 60_000

function row(closedAt: number, seconds = 60): ClosedRow {
  return { closedAt, sample: { seconds } as ClosedRow['sample'] }
}

describe('DeviceBatchQueue', () => {
  it('vazio nunca está na hora', () => {
    expect(new DeviceBatchQueue().due(10 * MIN)).toBe(false)
  })

  it('envia com 5 linhas', () => {
    const queue = new DeviceBatchQueue()
    for (let i = 0; i < 4; i++) queue.push(row(i * MIN))
    expect(queue.due(4 * MIN)).toBe(false)
    queue.push(row(4 * MIN))
    expect(queue.due(4 * MIN)).toBe(true)
  })

  it('envia quando a linha mais velha tem 5 min', () => {
    const queue = new DeviceBatchQueue()
    queue.push(row(0, 300))
    expect(queue.due(5 * MIN - 1)).toBe(false)
    expect(queue.due(5 * MIN)).toBe(true)
  })

  it('envia ao sair de call/live', () => {
    const queue = new DeviceBatchQueue()
    queue.push(row(0))
    queue.noteLeftCall()
    expect(queue.due(1000)).toBe(true)
  })

  it('drain: até 10 por pedido, com ago_s na hora do envio', () => {
    const queue = new DeviceBatchQueue()
    for (let i = 0; i < 12; i++) queue.push(row(i * 1000))
    const sent = queue.drain(20_000)
    expect(sent).toHaveLength(10)
    expect(sent[0]).toEqual({ seconds: 60, ago_s: 20 })
    expect(sent[9].ago_s).toBe(11)
  })

  it('espaça os pedidos (o servidor aceita 3 a cada 5 min)', () => {
    const queue = new DeviceBatchQueue()
    for (let i = 0; i < 15; i++) queue.push(row(0))
    queue.drain(0) // sobram 5
    expect(queue.due(MIN_SEND_GAP_MS - 1)).toBe(false)
    expect(queue.due(MIN_SEND_GAP_MS)).toBe(true)
  })

  it('drain zera o "saiu da call" e descarta linha de mais de 1 h', () => {
    const queue = new DeviceBatchQueue()
    queue.push(row(0))
    queue.push(row(3_000_000))
    queue.noteLeftCall()
    expect(queue.drain(3_700_000)).toEqual([{ seconds: 60, ago_s: 700 }])
    queue.push(row(3_700_000))
    expect(queue.due(3_700_000 + MIN_SEND_GAP_MS)).toBe(false)
  })

  it('fila com teto: a mais velha sai primeiro', () => {
    const queue = new DeviceBatchQueue()
    for (let i = 0; i < 25; i++) queue.push(row(i))
    expect(queue.drain(100)[0].ago_s).toBe(0)
    expect(queue.size()).toBe(10)
  })

  it('clear esvazia', () => {
    const queue = new DeviceBatchQueue()
    queue.push(row(0))
    queue.clear()
    expect(queue.size()).toBe(0)
  })
})
