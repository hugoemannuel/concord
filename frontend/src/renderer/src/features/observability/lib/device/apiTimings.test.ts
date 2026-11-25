import { describe, expect, it } from 'vitest'
import { ApiTimings } from './apiTimings'

const entry = (name: string, duration: number, initiatorType = 'fetch') => ({
  name,
  duration,
  initiatorType
})

describe('ApiTimings', () => {
  it('só fetch/XHR para /api/ do servidor do app: p50, p95 e quantas', () => {
    const api = new ApiTimings('https://srv.example/api')
    api.add(entry('https://srv.example/api/servers', 80))
    api.add(entry('https://srv.example/api/messages?x=1', 300, 'xmlhttprequest'))
    api.add(entry('https://srv.example/api/me', 100))
    api.add(entry('https://srv.example/uploads/a.png', 900))
    api.add(entry('https://srv.example/api/x', 900, 'img'))
    api.add(entry('https://outro.example/api/x', 900))
    api.add(entry('https://srv.example/apifake', 900))
    expect(api.take()).toEqual({ p50Ms: 100, p95Ms: 300, count: 3 })
  })

  it('não conta a própria telemetria (/api/obs/)', () => {
    const api = new ApiTimings('https://srv.example/api')
    api.add(entry('https://srv.example/api/obs/device', 900))
    api.add(entry('https://srv.example/api/me', 50))
    expect(api.take()).toEqual({ p50Ms: 50, p95Ms: 50, count: 1 })
  })

  it('take zera', () => {
    const api = new ApiTimings('https://srv.example/api')
    api.add(entry('https://srv.example/api/me', 10.6))
    expect(api.take()).toEqual({ p50Ms: 11, p95Ms: 11, count: 1 })
    expect(api.take()).toEqual({ p50Ms: null, p95Ms: null, count: 0 })
  })
})
