import { describe, expect, it } from 'vitest'
import type { DraftAttachment } from '../../chat/lib/attachments'
import type { ViewOnceMedia } from '../../chat/api/messages'
import {
  canViewOnce,
  confirmText,
  isForbiddenError,
  mediaKey,
  outcomeState,
  pillLabel,
  pillState,
  sendExtra,
  settleViewOnce,
  syncViewOnce,
  restoreFocusOnClose,
  toggleViewOnceKey,
  viewOnceKey,
  shownPillState
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

describe('viewOnceKey / settleViewOnce', () => {
  const d = (localId: string, o: Partial<DraftAttachment> = {}): DraftAttachment =>
    ({ localId, kind: 'image', status: 'done', ...o }) as DraftAttachment

  it('a chave junta sala e anexo; sem permissão não há chave', () => {
    expect(viewOnceKey('conversation:1', [d('a')], true)).toBe('conversation:1|a')
    expect(viewOnceKey('conversation:1', [d('a')], false)).toBeNull()
    expect(viewOnceKey('conversation:1', [], true)).toBeNull()
  })

  it('só continua ligado na mesma sala e no mesmo anexo', () => {
    expect(settleViewOnce('conversation:1|a', 'conversation:1|a')).toBe(true)
    expect(settleViewOnce('conversation:1|a', 'conversation:2|a')).toBe(false)
    expect(settleViewOnce('conversation:1|a', 'conversation:1|b')).toBe(false)
    expect(settleViewOnce('conversation:1|a', null)).toBe(false)
    expect(settleViewOnce(null, 'conversation:1|a')).toBe(false)
    expect(settleViewOnce(null, null)).toBe(false)
  })

  it('alternar liga na chave atual e desliga na repetição', () => {
    expect(toggleViewOnceKey(null, 'k')).toBe('k')
    expect(toggleViewOnceKey('k', 'k')).toBeNull()
    expect(toggleViewOnceKey('outra', 'k')).toBe('k')
    expect(toggleViewOnceKey('k', null)).toBe('k')
  })
})

describe('syncViewOnce', () => {
  it('mesma chave mantém o estado (mesma referência); chave nova desliga', () => {
    const s = { seen: 'k', on: 'k' as string | null }
    expect(syncViewOnce(s, 'k')).toBe(s)
    expect(syncViewOnce(s, 'outra')).toEqual({ seen: 'outra', on: null })
    // voltar à chave antiga depois de sair não religa
    expect(syncViewOnce(syncViewOnce(s, 'outra'), 'k')).toEqual({ seen: 'k', on: null })
    expect(syncViewOnce(s, null)).toEqual({ seen: null, on: null })
  })
})

describe('restoreFocusOnClose', () => {
  it('só quando o visualizador passa de aberto para fechado', () => {
    expect(restoreFocusOnClose(true, false)).toBe(true)
    expect(restoreFocusOnClose(false, false)).toBe(false)
    expect(restoreFocusOnClose(false, true)).toBe(false)
    expect(restoreFocusOnClose(true, true)).toBe(false)
  })
})

describe('pílula', () => {
  const v = (o: Partial<ViewOnceMedia> = {}): ViewOnceMedia => ({
    id: 'a',
    kind: 'image',
    gone: false,
    viewer_ids: [],
    recipient_ids: ['me'],
    recipient_count: 1,
    ...o
  })

  it('os 4 estados', () => {
    expect(pillState(v(), 'au', 'me')).toBe('unseen')
    expect(pillState(v({ viewer_ids: ['me'], gone: true }), 'au', 'me')).toBe('seen')
    expect(pillState(v(), 'me', 'me')).toBe('sender')
    expect(pillState(v({ gone: true }), 'au', 'me')).toBe('expired')
  })

  it('quem entrou no grupo depois do envio (não está em recipient_ids): bloqueada', () => {
    expect(pillState(v({ recipient_ids: ['b', 'c'] }), 'au', 'me')).toBe('locked')
    expect(pillState(v({ recipient_ids: ['b'], gone: true }), 'au', 'me')).toBe('locked')
    // o autor nunca está na lista e continua vendo o andamento
    expect(pillState(v({ recipient_ids: ['b'] }), 'me', 'me')).toBe('sender')
  })

  it('bloqueada: o rótulo do autor, sem "Vista por"', () => {
    const grupo = v({ viewer_ids: ['b'], recipient_ids: ['b', 'c'], recipient_count: 2 })
    expect(pillLabel('locked', 'image', grupo)).toBe('Foto de visualização única')
    expect(pillLabel('locked', 'video', grupo)).toBe('Vídeo de visualização única')
  })

  it('o estado local vale só até o servidor mudar a mídia', () => {
    const antes = v({ gone: true })
    const local = { state: 'expired' as const, key: mediaKey(antes) }
    expect(shownPillState(local, antes, 'au', 'me')).toBe('expired')
    // message:update depois: quem abriu entra em viewer_ids → "Aberta"
    expect(shownPillState(local, v({ gone: true, viewer_ids: ['me'] }), 'au', 'me')).toBe('seen')
    expect(shownPillState(null, antes, 'au', 'me')).toBe('expired')
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

  it('403 na abertura: bloqueada de vez (sem tentar de novo)', () => {
    expect(outcomeState('forbidden')).toBe('locked')
    expect(isForbiddenError({ status: 403 })).toBe(true)
    expect(isForbiddenError({ status: 410 })).toBe(false)
    expect(isForbiddenError(null)).toBe(false)
  })
})
