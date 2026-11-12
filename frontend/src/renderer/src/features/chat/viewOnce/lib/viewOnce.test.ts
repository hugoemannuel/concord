import { describe, expect, it } from 'vitest'
import type { DraftAttachment } from '../../lib/attachments'
import { canViewOnce, sendExtra, settleViewOnce } from './viewOnce'

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
