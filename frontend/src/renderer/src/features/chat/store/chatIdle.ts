import type { ChatState } from './chatStore'

// Estado inicial do chat, tirado do chatStore (god file): é também o que o reset (logout) restaura.
export const IDLE_CHAT = {
  messagesByRoom: {},
  hasMoreByRoom: {},
  loadingByRoom: {},
  unreadByRoom: {},
  unreadByServer: {},
  mentionsByRoom: {},
  mentionsByServer: {},
  channelsByServer: {},
  activeRoom: null,
  presence: {},
  statuses: {},
  conversations: [],
  conversationsLoading: false,
  conversationsLoaded: false,
  pendingByRoom: {}
} satisfies Partial<ChatState>
