import { describe, expect, it } from 'vitest'
import type { DraftAttachment } from '../../chat/lib/attachments'
import type { ViewOnceMedia } from '../../chat/api/messages'
import {
  canViewOnce,
  confirmText,
  outcomeState,
  pillLabel,
  pillState,
  sendExtra,
  settleViewOnce
} from './viewOnce'

const draft = (over: Partial<DraftAttachment> = {}): DraftAttachment => ({
  localId: 'a',
  file: new File(['x'], 'foto.png'),
  kind: 'image',
  previewUrl: 'blob:x',
  status: 'done',
  progress: 1,
  ...over
})

describe('canViewOnce', () => {
  it('uma foto ou vídeo, pronto ou subindo, em conversa', () => {
    expect(canViewOnce([draft()], true)).toBe(true)
    expect(canViewOnce([draft({ kind: 'video', status: 'uploading' })], true)).toBe(true)
  })

  it('dois anexos, áudio, arquivo, erro, sem anexo ou canal: não', () => {
    expect(canViewOnce([draft(), draft({ localId: 'b' })], true)).toBe(false)
    expect(canViewOnce([draft({ kind: 'audio' })], true)).toBe(false)
    expect(canViewOnce([draft({ kind: 'file' })], true)).toBe(false)
    expect(canViewOnce([draft({ status: 'error' })], true)).toBe(false)
    expect(canViewOnce([], true)).toBe(false)
    expect(canViewOnce([draft()], false)).toBe(false)
  })
})

describe('sendExtra', () => {
  it('ligado leva viewOnce; desligado, nada', () => {
    expect(sendExtra(true)).toEqual({ viewOnce: true })
    expect(sendExtra(false)).toBeUndefined()
  })
})

describe('settleViewOnce', () => {
  it('só continua ligado enquanto é permitido', () => {
    expect(settleViewOnce(true, true)).toBe(true)
    expect(settleViewOnce(true, false)).toBe(false)
    expect(settleViewOnce(false, true)).toBe(false)
  })
})

describe('pílula', () => {
  const v = (o: Partial<ViewOnceMedia> = {}): ViewOnceMedia => ({
    id: 'a',
    kind: 'image',
    gone: false,
    viewer_ids: [],
    recipient_count: 1,
    ...o
  })

  it('os 4 estados', () => {
    expect(pillState(v(), 'au', 'me')).toBe('unseen')
    expect(pillState(v({ viewer_ids: ['me'], gone: true }), 'au', 'me')).toBe('seen')
    expect(pillState(v(), 'me', 'me')).toBe('sender')
    expect(pillState(v({ gone: true }), 'au', 'me')).toBe('expired')
  })

  it('textos exatos', () => {
    expect(pillLabel('unseen', 'image', v())).toBe('Foto')
    expect(pillLabel('unseen', 'video', v())).toBe('Vídeo')
    expect(pillLabel('seen', 'image', v())).toBe('Aberta')
    expect(pillLabel('expired', 'image', v())).toBe('Expirou')
    expect(pillLabel('sender', 'image', v())).toBe('Foto de visualização única')
    expect(pillLabel('sender', 'video', v())).toBe('Vídeo de visualização única')
    expect(pillLabel('sender', 'image', v({ viewer_ids: ['x', 'y'], recipient_count: 3 }))).toBe(
      'Foto de visualização única · Vista por 2 de 3'
    )
  })

  it('confirmação de foto e de vídeo', () => {
    expect(confirmText('image')).toBe('Esta foto só pode ser vista uma vez. Ao fechar, ela some.')
    expect(confirmText('video')).toBe('Este vídeo só pode ser visto uma vez. Ao fechar, ele some.')
  })
})

describe('outcomeState', () => {
  it('visto e vencido mudam a pílula; cancelar não', () => {
    expect(outcomeState('seen')).toBe('seen')
    expect(outcomeState('gone')).toBe('expired')
    expect(outcomeState('cancelled')).toBeNull()
  })
})
