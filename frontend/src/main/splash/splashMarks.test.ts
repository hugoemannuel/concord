import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dir = { path: '' }
vi.mock('electron', () => ({ app: { getPath: () => dir.path } }))

import {
  HIDDEN_RELAUNCH_MAX_AGE_MS,
  clearHiddenRelaunch,
  readSplashColors,
  saveHiddenRelaunch,
  saveSplashColors,
  takeHiddenRelaunch
} from './splashMarks'

beforeEach(() => {
  dir.path = mkdtempSync(join(tmpdir(), 'splash-'))
})

afterEach(() => {
  rmSync(dir.path, { recursive: true, force: true })
})

describe('cores da janelinha', () => {
  it('sem tema salvo: null (fica o escuro padrão)', () => {
    expect(readSplashColors()).toBeNull()
  })

  it('guarda e lê as cores do tema', () => {
    saveSplashColors({ color: '#ffffff', symbolColor: '#333333' })
    expect(readSplashColors()).toEqual({ color: '#ffffff', symbolColor: '#333333' })
  })

  it('arquivo mexido não passa', () => {
    writeFileSync(join(dir.path, 'splash-theme.json'), '{"color":"red","symbolColor":"#000000"}')
    expect(readSplashColors()).toBeNull()
  })
})

describe('reabrir escondido depois de instalar (Windows reabre sem --hidden)', () => {
  it('sem marca: não', () => {
    expect(takeHiddenRelaunch(1_000)).toBe(false)
  })

  it('marca recente vale uma vez só', () => {
    saveHiddenRelaunch(1_000)
    expect(takeHiddenRelaunch(2_000)).toBe(true)
    expect(takeHiddenRelaunch(3_000)).toBe(false)
  })

  it('marca velha (a instalação falhou e a pessoa abriu depois) não vale', () => {
    saveHiddenRelaunch(1_000)
    expect(takeHiddenRelaunch(1_000 + HIDDEN_RELAUNCH_MAX_AGE_MS + 1)).toBe(false)
  })

  it('abriu sem instalar: a marca some', () => {
    saveHiddenRelaunch(1_000)
    clearHiddenRelaunch()
    expect(takeHiddenRelaunch(2_000)).toBe(false)
  })
})
