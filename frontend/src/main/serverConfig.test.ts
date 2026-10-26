import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearServerUrl,
  healthzResult,
  manifestVersion,
  parseSavedServer,
  readSavedServerUrl,
  resolveServerUrl,
  saveServerUrl,
  updateFeedUrl
} from './serverConfig'

describe('resolveServerUrl', () => {
  it('o servidor embutido no build manda (build oficial)', () => {
    expect(resolveServerUrl({ built: 'https://vps.exemplo/', saved: 'http://outro:8080' })).toBe(
      'https://vps.exemplo'
    )
  })

  it('build genérico: o salvo; sem ele, nenhum (tela inicial)', () => {
    expect(resolveServerUrl({ built: '', saved: 'http://1.2.3.4:8080' })).toBe(
      'http://1.2.3.4:8080'
    )
    expect(resolveServerUrl({ built: ' ', saved: null })).toBeNull()
  })
})

describe('server.json', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'salinha-server-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('salva, lê e apaga', () => {
    expect(readSavedServerUrl(dir)).toBeNull()
    saveServerUrl(dir, 'http://1.2.3.4:8080')
    expect(readSavedServerUrl(dir)).toBe('http://1.2.3.4:8080')
    clearServerUrl(dir)
    expect(readSavedServerUrl(dir)).toBeNull()
    expect(() => clearServerUrl(dir)).not.toThrow()
  })

  it('arquivo estragado ou com endereço ruim conta como sem servidor', () => {
    writeFileSync(join(dir, 'server.json'), '{oops')
    expect(readSavedServerUrl(dir)).toBeNull()
    expect(parseSavedServer('{"url":"ftp://x"}')).toBeNull()
    expect(parseSavedServer('{"url":42}')).toBeNull()
    expect(parseSavedServer('{"url":"1.2.3.4:8080/"}')).toBe('http://1.2.3.4:8080')
  })
})

describe('updateFeedUrl', () => {
  it('fica em /updates/ do servidor', () => {
    expect(updateFeedUrl('http://1.2.3.4:8080')).toBe('http://1.2.3.4:8080/updates/')
    expect(updateFeedUrl(null)).toBe('')
  })
})

describe('healthzResult', () => {
  it('200 com status ok é servidor da Salinha', () => {
    expect(healthzResult(200, '{"status":"ok"}')).toEqual({ ok: true, serverVersion: null })
  })

  it('503 avisa que está subindo; o resto não é Salinha', () => {
    expect(healthzResult(503, '{"status":"starting"}').ok).toBe(false)
    expect(healthzResult(503, '{"status":"starting"}')).toMatchObject({
      error: expect.stringContaining('iniciando')
    })
    expect(healthzResult(200, '<html>')).toMatchObject({
      error: expect.stringContaining('não parece')
    })
    expect(healthzResult(404, '')).toMatchObject({ ok: false })
  })
})

describe('manifestVersion', () => {
  it('lê a versão do latest.yml', () => {
    expect(manifestVersion('version: 0.6.1\npath: Salinha-0.6.1-setup.exe\n')).toBe('0.6.1')
    expect(manifestVersion("version: '0.7.0'\n")).toBe('0.7.0')
    expect(manifestVersion('nada')).toBeNull()
  })
})
