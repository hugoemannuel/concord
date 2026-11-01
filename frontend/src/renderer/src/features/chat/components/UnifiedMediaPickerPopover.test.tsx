import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).AudioWorkletNode = class {}
  ;(globalThis as Record<string, unknown>).document = {
    visibilityState: 'visible',
    hasFocus: () => false
  }
})
vi.mock('../../../app/router', () => ({ router: { navigate: vi.fn() } }))
vi.mock('../api/conversations', () => ({
  listConversations: vi.fn(async () => []),
  markConversationRead: vi.fn(async () => {})
}))
vi.mock('../../call/store/callStore', () => ({
  useCallStore: { getState: () => ({ handleWsReconnect: vi.fn(), handleWsEvent: vi.fn() }) }
}))

import UnifiedMediaPickerPopover from './UnifiedMediaPickerPopover'
import MessageSticker from './MessageSticker'
import MessageGif from './MessageGif'
import ReactionChips from './ReactionChips'
import PinnedMessagesPopover from './PinnedMessagesPopover'
import { useStickerStore, selectStickers } from '../store/stickerStore'
import { usePinStore } from '../store/pinStore'
import { useAuthStore } from '../../auth/store/authStore'
import * as stickersApi from '../api/stickers'
import * as messagesApi from '../api/messages'
import { useChatStore } from '../store/chatStore'

describe('UnifiedMediaPickerPopover & Media Components', () => {
  it('renders emoji tab by default with Emojis, GIFs and Figurinhas tabs', () => {
    const html = renderToStaticMarkup(
      <UnifiedMediaPickerPopover
        serverId="s1"
        onSelectEmoji={() => {}}
        onSelectGif={() => {}}
        onSelectSticker={() => {}}
        onClose={() => {}}
      />
    )

    expect(html).toContain('Emojis')
    expect(html).toContain('GIFs')
    expect(html).toContain('Figurinhas')
    expect(html).toContain('Joinha')
    // As abas usam os ícones do conjunto (carinha, GIF, figurinha), não emoji.
    const tabs = html.slice(0, html.indexOf('Figurinhas</span>'))
    for (const glyph of ['😊', '👾', '💟']) expect(tabs).not.toContain(glyph)
    expect(tabs.match(/<svg/g)?.length).toBe(3)
  })

  it('renders MessageSticker component with name and title attributes', () => {
    const html = renderToStaticMarkup(
      <MessageSticker
        sticker={{
          id: 'stk-1',
          server_id: 's1',
          name: 'doge',
          content_type: 'image/png'
        }}
      />
    )
    expect(html).toContain(':doge:')
    expect(html).toContain('title=":doge:"')
  })

  it('renders MessageGif component with GIF badge and scaled dimensions', () => {
    const html = renderToStaticMarkup(
      <MessageGif
        gifUrl="https://media.giphy.com/test.gif"
        metadata={{ width: 400, height: 300, preview_url: 'https://media.giphy.com/p.gif' }}
      />
    )
    expect(html).toContain('GIF')
    expect(html).toContain('https://media.giphy.com/test.gif')
    expect(html).toContain('width:300px;height:225px')
  })

  it('renders ReactionChips with active user reaction and + button when canReact=true', () => {
    const html = renderToStaticMarkup(
      <ReactionChips
        reactions={[
          { emoji: '🔥', count: 2, user_ids: ['u1', 'u2'] },
          { emoji: '❤️', count: 1, user_ids: ['u2'] }
        ]}
        meId="u1"
        canReact={true}
        pickerAnchor={null}
        onReact={() => {}}
        onOpenPicker={() => {}}
      />
    )
    expect(html).toContain('🔥')
    expect(html).toContain('2')
    expect(html).toContain('❤️')
    expect(html).toContain('Adicionar reação')
  })

  it('locks non-self ReactionChips and hides + button when canReact=false', () => {
    const html = renderToStaticMarkup(
      <ReactionChips
        reactions={[
          { emoji: '🔥', count: 1, user_ids: ['u1'] },
          { emoji: '❤️', count: 1, user_ids: ['u2'] }
        ]}
        meId="u1"
        canReact={false}
        pickerAnchor={null}
        onReact={() => {}}
        onOpenPicker={() => {}}
      />
    )
    expect(html).not.toContain('Adicionar reação')
    expect(html).toContain('aria-disabled="true"')
  })

  it('renders PinnedMessagesPopover with sticker and GIF pinned messages', () => {
    const pinsData: Record<string, messagesApi.PinnedMessage[]> = {
      c1: [
        {
          id: 'm-stk',
          channel_id: 'c1',
          author_id: 'u1',
          content: '',
          created_at: '2026-10-26T12:00:00Z',
          pinned_at: '2026-10-26T12:01:00Z',
          pinned_by_id: 'u1',
          sticker_id: 'stk-1',
          sticker: {
            id: 'stk-1',
            server_id: 's1',
            name: 'cool',
            content_type: 'image/png'
          }
        },
        {
          id: 'm-gif',
          channel_id: 'c1',
          author_id: 'u1',
          content: 'Olha esse GIF',
          created_at: '2026-10-26T12:02:00Z',
          pinned_at: '2026-10-26T12:03:00Z',
          pinned_by_id: 'u1',
          gif_url: 'https://media.giphy.com/pinned.gif',
          gif_metadata: { width: 200, height: 150 }
        }
      ]
    }
    usePinStore.setState({
      pinsByChannel: pinsData,
      loadingByChannel: { c1: false }
    })
    Object.assign(usePinStore.getInitialState(), {
      pinsByChannel: pinsData,
      loadingByChannel: { c1: false }
    })

    const html = renderToStaticMarkup(
      <PinnedMessagesPopover channelId="c1" canModerate={true} onClose={() => {}} />
    )
    expect(html).toContain(':cool:')
    expect(html).toContain('https://media.giphy.com/pinned.gif')
    expect(html).toContain('Olha esse GIF')
  })
})

describe('useStickerStore', () => {
  beforeEach(() => {
    useStickerStore.setState({ stickersByServer: {}, loadingByServer: {} })
    vi.restoreAllMocks()
  })

  it('selectStickers returns stable empty array reference to prevent React #185 in Zustand v5', () => {
    const state = useStickerStore.getState()
    const a = selectStickers('srv-unloaded')(state)
    const b = selectStickers('srv-unloaded')(state)
    const c = selectStickers(null)(state)
    expect(a).toBe(b)
    expect(a).toBe(c)
    expect(a).toHaveLength(0)
  })

  it('loads, uploads, deletes and processes WebSocket events for stickers', async () => {
    const sampleSticker: stickersApi.ServerSticker = {
      id: 'stk-10',
      server_id: 'srv-1',
      uploader_id: 'u1',
      name: 'party',
      content_type: 'image/png',
      size_bytes: 512,
      created_at: '2026-10-26T12:00:00Z'
    }

    vi.spyOn(stickersApi, 'fetchServerStickers').mockResolvedValue([sampleSticker])
    await useStickerStore.getState().loadStickers('srv-1')
    expect(useStickerStore.getState().stickersByServer['srv-1']).toEqual([sampleSticker])

    const uploadedSticker: stickersApi.ServerSticker = {
      ...sampleSticker,
      id: 'stk-11',
      name: 'rocket'
    }
    vi.spyOn(stickersApi, 'uploadServerSticker').mockResolvedValue(uploadedSticker)
    await useStickerStore
      .getState()
      .uploadSticker('srv-1', 'rocket', new Blob(['x'], { type: 'image/png' }), 'rocket.png')
    expect(useStickerStore.getState().stickersByServer['srv-1'].map((s) => s.id)).toEqual([
      'stk-11',
      'stk-10'
    ])

    // Duplicate WS event is ignored cleanly
    const handledCreate = useStickerStore.getState().handleWsEvent({
      type: 'sticker:created',
      payload: { server_id: 'srv-1', sticker: uploadedSticker }
    })
    expect(handledCreate).toBe(true)
    expect(useStickerStore.getState().stickersByServer['srv-1']).toHaveLength(2)

    // New WS sticker:created adds to list
    const wsSticker: stickersApi.ServerSticker = {
      ...sampleSticker,
      id: 'stk-12',
      name: 'live_ws'
    }
    useStickerStore.getState().handleWsEvent({
      type: 'sticker:created',
      payload: { server_id: 'srv-1', sticker: wsSticker }
    })
    expect(useStickerStore.getState().stickersByServer['srv-1'].map((s) => s.id)).toEqual([
      'stk-12',
      'stk-11',
      'stk-10'
    ])

    // WS sticker:deleted removes from list
    const handledDelete = useStickerStore.getState().handleWsEvent({
      type: 'sticker:deleted',
      payload: { server_id: 'srv-1', sticker_id: 'stk-12' }
    })
    expect(handledDelete).toBe(true)
    expect(useStickerStore.getState().stickersByServer['srv-1'].map((s) => s.id)).toEqual([
      'stk-11',
      'stk-10'
    ])

    // API deleteSticker removes from list
    vi.spyOn(stickersApi, 'deleteServerSticker').mockResolvedValue()
    await useStickerStore.getState().deleteSticker('srv-1', 'stk-11')
    expect(useStickerStore.getState().stickersByServer['srv-1'].map((s) => s.id)).toEqual([
      'stk-10'
    ])
  })
})

describe('useChatStore — chat, reactions, stickers and GIFs', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
    useAuthStore.setState({
      user: {
        id: 'me-user',
        username: 'me',
        display_name: 'Me',
        email: 'me@test.com',
        status: 'online',
        created_at: '2026-10-26T00:00:00Z',
        updated_at: '2026-10-26T00:00:00Z'
      },
      accessToken: 'fake-token'
    })
    vi.restoreAllMocks()
  })

  it('sends sticker and GIF messages with replyToId and merges into open room', async () => {
    const room = 'channel:ch-1'
    vi.spyOn(messagesApi, 'listChannelMessages').mockResolvedValue([])
    await useChatStore.getState().openRoom(room)

    const sentStickerMsg: messagesApi.Message = {
      id: 'msg-stk-1',
      channel_id: 'ch-1',
      author_id: 'me-user',
      content: '',
      reply_to_id: 'msg-0',
      sticker_id: 'stk-1',
      sticker: {
        id: 'stk-1',
        server_id: 'srv-1',
        name: 'cat',
        content_type: 'image/png'
      },
      created_at: '2026-10-26T12:01:00Z'
    }
    const sendSpy = vi.spyOn(messagesApi, 'sendChannelMessage').mockResolvedValue(sentStickerMsg)
    vi.spyOn(messagesApi, 'listChannelMessages').mockResolvedValue([sentStickerMsg])

    await useChatStore.getState().sendToRoom(room, '', [], 'msg-0', { stickerId: 'stk-1' })
    expect(sendSpy).toHaveBeenCalledWith('ch-1', '', [], 'msg-0', { stickerId: 'stk-1' })
    expect(useChatStore.getState().messagesByRoom[room]).toHaveLength(1)
    expect(useChatStore.getState().messagesByRoom[room][0].sticker?.name).toBe('cat')

    // When sticker:deleted arrives over WS, chatStore clears sticker & sticker_id on the message
    useChatStore.getState().handleWsEvent({
      type: 'sticker:deleted',
      payload: { server_id: 'srv-1', sticker_id: 'stk-1' }
    })
    expect(useChatStore.getState().messagesByRoom[room][0].sticker).toBeNull()
    expect(useChatStore.getState().messagesByRoom[room][0].sticker_id).toBeNull()
  })

  it('optimistically toggles reactions and rolls back on API failure, plus handles WS reaction events', async () => {
    const room = 'channel:ch-1'
    const baseMsg: messagesApi.Message = {
      id: 'msg-1',
      channel_id: 'ch-1',
      author_id: 'other-user',
      content: 'Hello world',
      created_at: '2026-10-26T12:00:00Z',
      reactions: []
    }
    useChatStore.setState({ messagesByRoom: { [room]: [baseMsg] } })

    const addSpy = vi.spyOn(messagesApi, 'addChannelReaction').mockResolvedValue()
    await useChatStore.getState().toggleReaction(room, 'msg-1', '👍')
    expect(addSpy).toHaveBeenCalledWith('ch-1', 'msg-1', '👍')
    expect(useChatStore.getState().messagesByRoom[room][0].reactions).toEqual([
      { emoji: '👍', count: 1, user_ids: ['me-user'] }
    ])

    // Another user reacts via WS
    useChatStore.getState().handleWsEvent({
      type: 'message:reaction:add',
      payload: {
        channel_id: 'ch-1',
        message_id: 'msg-1',
        user_id: 'user-2',
        emoji: '👍'
      }
    })
    expect(useChatStore.getState().messagesByRoom[room][0].reactions).toEqual([
      { emoji: '👍', count: 2, user_ids: ['me-user', 'user-2'] }
    ])

    // Toggle again removes our reaction; simulate API error to verify rollback
    vi.spyOn(messagesApi, 'removeChannelReaction').mockRejectedValue(new Error('network fail'))
    await expect(useChatStore.getState().toggleReaction(room, 'msg-1', '👍')).rejects.toThrow(
      'network fail'
    )
    // Rolled back to still having our reaction
    expect(
      useChatStore.getState().messagesByRoom[room][0].reactions?.[0].user_ids
    ).toContain('me-user')

    // WS reaction remove from user-2
    useChatStore.getState().handleWsEvent({
      type: 'message:reaction:remove',
      payload: {
        channel_id: 'ch-1',
        message_id: 'msg-1',
        user_id: 'user-2',
        emoji: '👍'
      }
    })
    expect(useChatStore.getState().messagesByRoom[room][0].reactions).toEqual([
      { emoji: '👍', count: 1, user_ids: ['me-user'] }
    ])
  })
})
