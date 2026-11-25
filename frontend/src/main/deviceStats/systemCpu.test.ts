import { describe, expect, it } from 'vitest'
import { SystemCpu } from './systemCpu'

const core = (busy: number, idle: number) => ({
  times: { user: busy, nice: 0, sys: 0, idle, irq: 0 }
})

describe('SystemCpu', () => {
  it('a primeira leitura só aquece', () => {
    expect(new SystemCpu().sample([core(10, 90)])).toBeNull()
  })

  it('% ocupada da máquina inteira pela diferença entre leituras', () => {
    const cpu = new SystemCpu()
    cpu.sample([core(0, 0), core(0, 0)])
    // núcleo 1: 30 ocupado de 100; núcleo 2: 10 de 100 → 40 de 200.
    expect(cpu.sample([core(30, 70), core(10, 90)])).toBe(20)
  })

  it('sem tempo passado ou com contador que voltou: null', () => {
    const cpu = new SystemCpu()
    cpu.sample([core(50, 50)])
    expect(cpu.sample([core(50, 50)])).toBeNull()
    expect(cpu.sample([core(10, 10)])).toBeNull()
  })

  it('lista vazia (os.cpus() falhou) não mede', () => {
    const cpu = new SystemCpu()
    cpu.sample([])
    expect(cpu.sample([])).toBeNull()
  })
})
