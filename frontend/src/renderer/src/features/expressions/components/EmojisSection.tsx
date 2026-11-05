import { useServerStore } from '../../servers/store/serverStore'
import { useEmojiStore } from '../../emojis/store/emojiStore'
import type { CustomEmoji as Emoji } from '../../emojis/api/emojis'
import CustomEmoji from '../../emojis/components/CustomEmoji'
import EmojiUploadModal from '../../emojis/components/EmojiUploadModal'
import { useExpressionAccess } from '../hooks/useExpressionAccess'
import { useExpressionLoad } from '../hooks/useExpressionLoad'
import ExpressionManager from './ExpressionManager'

const NO_EMOJIS: Emoji[] = []

/** Uma carga por sessão (depois o ws mantém); se falhou, carrega de novo. */
const loadEmojis = async (): Promise<boolean> => {
  await useEmojiStore.getState().ensureLoaded()
  return useEmojiStore.getState().loaded
}

/** Emojis do servidor aberto, nas configurações do servidor. */
export default function EmojisSection(): React.JSX.Element | null {
  const serverId = useServerStore((s) => s.currentServer?.id)
  const emojis = useEmojiStore(
    (s) => s.groups.find((g) => g.server_id === serverId)?.emojis ?? NO_EMOJIS
  )
  const access = useExpressionAccess('emoji')
  const { status, retry } = useExpressionLoad(loadEmojis)
  if (!serverId) return null
  return (
    <ExpressionManager
      kind="emoji"
      items={emojis}
      status={status}
      onRetry={retry}
      canAdd={access.canAdd}
      canManage={access.canManage}
      preview={(e) => <CustomEmoji id={e.id} name={e.name} size="jumbo" />}
      meta={() => undefined}
      save={(e, values) => useEmojiStore.getState().rename(serverId, e.id, values.name)}
      remove={(e) => useEmojiStore.getState().remove(serverId, e.id)}
      upload={(close) => <EmojiUploadModal serverId={serverId} onClose={close} />}
    />
  )
}
