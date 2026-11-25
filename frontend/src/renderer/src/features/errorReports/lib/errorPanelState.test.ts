import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import {
  attemptKey,
  failedLoad,
  INITIAL_PANEL,
  panelReducer,
  stateForKey,
  versionOptions
} from './errorPanelState'

describe('panelReducer', () => {
  const opened = { source: 'mobile' as const, version: '1.2.0', open: 'fp1' }
  it('trocar a origem zera a versão (as versões mudam por origem) e volta à lista', () => {
    expect(panelReducer(opened, { type: 'source', source: 'main' })).toEqual({
      source: 'main',
      version: '',
      open: null
    })
  })
  it('trocar a versão mantém a origem e volta à lista', () => {
    expect(panelReducer(opened, { type: 'version', version: '1.1.0' })).toEqual({
      source: 'mobile',
      version: '1.1.0',
      open: null
    })
  })
  it('abrir e fechar um grupo', () => {
    const open = panelReducer(INITIAL_PANEL, { type: 'open', fingerprint: 'fp9' })
    expect(open).toEqual({ source: '', version: '', open: 'fp9' })
    expect(panelReducer(open, { type: 'close' })).toEqual(INITIAL_PANEL)
  })
})

describe('versionOptions', () => {
  it('as versões da resposta', () => {
    expect(versionOptions(['1.4.2', '1.4.1'], '')).toEqual(['1.4.2', '1.4.1'])
    expect(versionOptions(['1.4.2', '1.4.1'], '1.4.1')).toEqual(['1.4.2', '1.4.1'])
  })
  it('a escolhida continua na lista mesmo que a resposta não a traga', () => {
    expect(versionOptions(['1.4.2'], '1.0.0')).toEqual(['1.0.0', '1.4.2'])
  })
})

describe('failedLoad', () => {
  it('403 = só devs; 404 = o grupo sumiu; o resto = tentar de novo', () => {
    expect(failedLoad(new ApiError(403, 'x'))).toEqual({ status: 'forbidden' })
    expect(failedLoad(new ApiError(404, 'x'))).toEqual({ status: 'missing' })
    expect(failedLoad(new ApiError(500, 'x'))).toEqual({ status: 'error' })
    expect(failedLoad(new Error('rede'))).toEqual({ status: 'error' })
  })
})

describe('attemptKey e stateForKey', () => {
  it('cada tentativa é um pedido; null não busca', () => {
    expect(attemptKey('[7,"",""]', 0)).toBe('[7,"",""]#0')
    expect(attemptKey('[7,"",""]', 1)).toBe('[7,"",""]#1')
    expect(attemptKey(null, 3)).toBeNull()
  })
  it('estado de outro pedido (período ou filtro anterior) é carregando', () => {
    const entry = { key: 'a#0', state: { status: 'ready' as const, data: 1 } }
    expect(stateForKey(entry, 'a#0')).toEqual({ status: 'ready', data: 1 })
    expect(stateForKey(entry, 'b#0')).toEqual({ status: 'loading' })
    expect(stateForKey(null, 'a#0')).toEqual({ status: 'loading' })
    expect(stateForKey(entry, null)).toEqual({ status: 'loading' })
  })
})
