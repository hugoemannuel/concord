import { describe, expect, it } from 'vitest'
import { HelperSampler, parseChildren, parseStatm, parseStatTicks } from './linuxHelpers'

// /proc/<pid>/stat: o nome (2º campo) pode ter espaço e parêntese.
const stat = (utime: number, stime: number, start = 500): string =>
  `42 (concord live) S 1 42 42 0 -1 4194560 100 0 0 0 ${utime} ${stime} 0 0 20 0 4 0 ${start} 1000 50`

describe('parsers do /proc', () => {
  it('filhos: PIDs separados por espaço', () => {
    expect(parseChildren('12 34 56 \n')).toEqual([12, 34, 56])
    expect(parseChildren('')).toEqual([])
  })

  it('stat: utime+stime e o início, depois do nome entre parênteses', () => {
    expect(parseStatTicks(stat(100, 50, 777))).toEqual({ ticks: 150, start: '777' })
    expect(parseStatTicks('lixo')).toBeNull()
  })

  it('statm: páginas residentes (2º campo)', () => {
    expect(parseStatm('5000 2560 100 1 0 300 0')).toBe(2560)
    expect(parseStatm('x')).toBeNull()
  })
})

function fakeProc(files: Record<string, string>): (path: string) => string | null {
  return (path) => files[path] ?? null
}

describe('HelperSampler', () => {
  it('soma CPU (% da máquina) e memória só dos filhos fora do getAppMetrics', () => {
    const files: Record<string, string> = {
      '/proc/1/task/1/children': '10 20 30',
      '/proc/20/stat': stat(0, 0),
      '/proc/20/statm': '0 256',
      '/proc/30/stat': stat(0, 0, 900),
      '/proc/30/statm': '0 512'
    }
    const sampler = new HelperSampler(1, fakeProc(files))
    const first = sampler.sample(new Set([10]), 0, 2)
    // 256 + 512 páginas de 4 KiB = 3 MB; CPU ainda aquecendo.
    expect(first).toEqual({ cpu: null, memMB: 3 })

    files['/proc/20/stat'] = stat(100, 0)
    files['/proc/30/stat'] = stat(50, 50, 900)
    // 200 ticks = 2 s de CPU em 10 s num computador de 2 núcleos = 10%.
    expect(sampler.sample(new Set([10]), 10_000, 2)).toEqual({ cpu: 10, memMB: 3 })
  })

  it('sem filhos nativos: zero, não null (mediu e não tinha)', () => {
    const sampler = new HelperSampler(1, fakeProc({ '/proc/1/task/1/children': '10' }))
    sampler.sample(new Set([10]), 0, 4)
    expect(sampler.sample(new Set([10]), 15_000, 4)).toEqual({ cpu: 0, memMB: 0 })
  })

  it('sem /proc (ou ilegível): null', () => {
    const sampler = new HelperSampler(1, fakeProc({}))
    expect(sampler.sample(new Set(), 0, 4)).toEqual({ cpu: null, memMB: null })
  })

  it('PID reaproveitado (outro início) não conta a diferença', () => {
    const files: Record<string, string> = {
      '/proc/1/task/1/children': '20',
      '/proc/20/stat': stat(100, 0, 500),
      '/proc/20/statm': '0 0'
    }
    const sampler = new HelperSampler(1, fakeProc(files))
    sampler.sample(new Set(), 0, 1)
    files['/proc/20/stat'] = stat(300, 0, 999)
    expect(sampler.sample(new Set(), 10_000, 1)).toEqual({ cpu: 0, memMB: 0 })
  })

  it('filho que sumiu entre a lista e a leitura é pulado', () => {
    const files = { '/proc/1/task/1/children': '20' }
    const sampler = new HelperSampler(1, fakeProc(files))
    expect(sampler.sample(new Set(), 0, 1)).toEqual({ cpu: null, memMB: 0 })
  })
})
