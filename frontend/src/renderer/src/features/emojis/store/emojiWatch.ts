import { useAuthStore } from '../../auth/store/authStore'
import { useServerStore } from '../../servers/store/serverStore'
import { resetEmojiStore, useEmojiStore } from './emojiStore'
import { clearEmojiSrcs } from './emojiSrc'
import { resetExpressionOrigins } from './expressionOrigins'

// Invalidação explícita dos emojis: entrou, saiu, foi expulso ou o servidor
// sumiu → a lista de servidores muda e recarrega (se já tinha carregado);
// trocou de conta → zera (as URLs das imagens levam o token da conta).

export function sameServerIds(a: { id: string }[], b: { id: string }[]): boolean {
  if (a.length !== b.length) return false
  const ids = new Set(a.map((s) => s.id))
  return b.every((s) => ids.has(s.id))
}

let started = false

export function startEmojiWatch(): void {
  if (started) return
  started = true
  useServerStore.subscribe((state, prev) => {
    if (state.servers === prev.servers || sameServerIds(state.servers, prev.servers)) return
    if (useEmojiStore.getState().loaded) void useEmojiStore.getState().reload()
  })
  useAuthStore.subscribe((state, prev) => {
    if (state.user?.id === prev.user?.id) return
    resetEmojiStore()
    clearEmojiSrcs()
    resetExpressionOrigins()
  })
}
