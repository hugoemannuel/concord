import { useServerStore } from '../../servers/store/serverStore'
import { selectStickers, useStickerStore } from '../../chat/store/stickerStore'
import StickerUploadModal from '../../chat/components/StickerUploadModal'
import { useExpressionAccess } from '../hooks/useExpressionAccess'
import { useExpressionLoad } from '../hooks/useExpressionLoad'
import { uploaderMeta } from '../lib/expressionTexts'
import ExpressionManager from './ExpressionManager'
import { StickerThumb } from './ExpressionPreviews'

/** Busca de novo ao abrir: as figurinhas dos servidores da pessoa, numa consulta só. */
const loadStickers = (): Promise<boolean> => useStickerStore.getState().loadMine()

/** Figurinhas do servidor aberto, nas configurações do servidor. */
export default function StickersSection(): React.JSX.Element | null {
  const serverId = useServerStore((s) => s.currentServer?.id)
  const stickers = useStickerStore(selectStickers(serverId))
  const access = useExpressionAccess('sticker')
  const { status, retry } = useExpressionLoad(loadStickers)
  if (!serverId) return null
  return (
    <ExpressionManager
      kind="sticker"
      items={stickers}
      status={status}
      onRetry={retry}
      canAdd={access.canAdd}
      canManage={access.canManage}
      preview={(s) => <StickerThumb id={s.id} name={s.name} />}
      meta={(s) => uploaderMeta(s.uploader_name)}
      save={(s, values) => useStickerStore.getState().renameSticker(serverId, s.id, values.name)}
      remove={(s) => useStickerStore.getState().deleteSticker(serverId, s.id)}
      upload={(close) => <StickerUploadModal open serverId={serverId} onClose={close} />}
    />
  )
}
