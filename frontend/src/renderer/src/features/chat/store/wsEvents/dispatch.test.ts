import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatState } from '../chatStore'
import type { ChatWsContext } from './context'

// Cada evento vai para um dono só, na ordem de antes (prefixo específico
// antes do geral); evento desconhecido passa por cargos e figurinhas.
const h = vi.hoisted(() => {
  const store = (): { handleWsEvent: ReturnType<typeof vi.fn> } => ({ handleWsEvent: vi.fn() })
  return {
    soundboard: store(),
    music: store(),
    activity: store(),
    call: store(),
    typing: store(),
    level: store(),
    boost: store(),
    badge: store(),
    proposal: store(),
    archived: store(),
    notify: store(),
    updateCheck: vi.fn(),
    ping: vi.fn(),
    toast: { info: vi.fn() },
    role: vi.fn(() => false),
    sticker: vi.fn(() => false)
  }
})
const of = (s: unknown): { useStore: { getState: () => unknown } } => ({
  useStore: { getState: () => s }
})
vi.mock('../../../call/store/soundboardStore', () => ({
  useSoundboardStore: of(h.soundboard).useStore
}))
vi.mock('../../../music/store/musicStore', () => ({ useMusicStore: of(h.music).useStore }))
vi.mock('../../../activity/store/activityStore', () => ({
  useActivityStore: of(h.activity).useStore
}))
vi.mock('../../../call/store/callStore', () => ({ useCallStore: of(h.call).useStore }))
vi.mock('../typingStore', () => ({ useTypingStore: of(h.typing).useStore }))
vi.mock('../../../levels/store/levelStore', () => ({ useLevelStore: of(h.level).useStore }))
vi.mock('../../../levels/store/boostStore', () => ({ useBoostStore: of(h.boost).useStore }))
vi.mock('../../../levels/store/badgeStore', () => ({ useBadgeStore: of(h.badge).useStore }))
vi.mock('../../../proposals/store/proposalStore', () => ({
  useProposalStore: of(h.proposal).useStore
}))
vi.mock('../../../proposals/store/archivedProposalStore', () => ({
  useArchivedProposalStore: of(h.archived).useStore
}))
vi.mock('../../../notifications/store/notifySettingsStore', () => ({
  useNotifySettingsStore: of(h.notify).useStore
}))
vi.mock('../../../updates/lib/appUpdate', () => ({
  APP_UPDATE_EVENT: 'app:update',
  requestUpdateCheck: h.updateCheck
}))
vi.mock('./alerts', () => ({ ping: h.ping }))
vi.mock('../../../../shared/store/toastStore', () => ({ showToast: h.toast }))
vi.mock('./servers', () => ({ SERVER_HANDLERS: {}, handleRoleEvent: h.role }))
vi.mock('./stickers', () => ({ handleStickerEvent: h.sticker }))
vi.mock('../../../../app/router', () => ({ router: { navigate: vi.fn() } }))

const { dispatchWsEvent } = await import('./dispatch')

let state: ChatState
const ctx = {
  set: (next) => {
    state = { ...state, ...next(state) }
  },
  get: () => state
} as ChatWsContext

const send = (type: string, payload: unknown = {}): void => dispatchWsEvent({ type, payload }, ctx)

beforeEach(() => {
  vi.clearAllMocks()
  state = { unreadByRoom: {} } as unknown as ChatState
})

describe('dispatchWsEvent', () => {
  it.each([
    ['call:soundboard', h.soundboard],
    ['soundboard:play', h.soundboard],
    ['music:state', h.music],
    ['call:activity:start', h.activity],
    ['call:ring', h.call],
    ['typing', h.typing],
    ['typing:stop', h.typing],
    ['level:up', h.level],
    ['voice:boost', h.boost],
    ['badge:earned', h.badge],
    ['notification-settings:update', h.notify],
    ['proposal:update', h.proposal],
    ['proposal:archive', h.archived],
    ['proposal:unarchive', h.archived]
  ])('%s vai só para o store dono', (type, owner) => {
    send(type)
    const owners = [
      h.soundboard,
      h.music,
      h.activity,
      h.call,
      h.typing,
      h.level,
      h.boost,
      h.badge,
      h.proposal,
      h.archived,
      h.notify
    ]
    for (const s of owners) expect(s.handleWsEvent).toHaveBeenCalledTimes(s === owner ? 1 : 0)
    expect(h.role).not.toHaveBeenCalled()
  })

  it('app:update pede a checagem de atualização', () => {
    send('app:update')
    expect(h.updateCheck).toHaveBeenCalledOnce()
  })

  it('proposal:mention vai ao store e avisa a pessoa', () => {
    const mention = {
      proposal_id: 'p1',
      proposal_title: 'Festa',
      author_name: 'Ana',
      snippet: 'oi'
    }
    send('proposal:mention', mention)
    expect(h.proposal.handleWsEvent).toHaveBeenCalledOnce()
    expect(h.ping).toHaveBeenCalledWith(expect.objectContaining({ kind: 'mention' }))
    expect(h.toast.info).toHaveBeenCalledWith('Ana te marcou na proposta "Festa"')
  })

  it('proposal:mention sem proposta não avisa', () => {
    send('proposal:mention', null)
    expect(h.proposal.handleWsEvent).toHaveBeenCalledOnce()
    expect(h.ping).not.toHaveBeenCalled()
  })

  it('evento do chat vai para o tratador do tipo (payload nulo vira objeto vazio)', () => {
    send('conversation:read', { conversation_id: 'd1' })
    expect(state.unreadByRoom).toEqual({ 'conversation:d1': 0 })
    expect(() => send('conversation:read', null)).not.toThrow()
    expect(h.role).not.toHaveBeenCalled()
  })

  it('evento desconhecido: cargos e, se não for, figurinhas', () => {
    send('sticker:created')
    expect(h.role).toHaveBeenCalledOnce()
    expect(h.sticker).toHaveBeenCalledOnce()
    h.role.mockReturnValueOnce(true)
    send('role:update')
    expect(h.sticker).toHaveBeenCalledOnce()
  })
})
