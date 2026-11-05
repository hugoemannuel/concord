import { useCallback } from 'react'
import { useServerStore } from '../../servers/store/serverStore'
import { useSoundboardStore } from '../../call/store/soundboardStore'
import type { SoundboardItem } from '../../call/api/soundboard'
import SoundboardUploadModal from '../../call/components/SoundboardUploadModal'
import { useExpressionAccess } from '../hooks/useExpressionAccess'
import { useExpressionLoad } from '../hooks/useExpressionLoad'
import { soundMeta } from '../lib/expressionTexts'
import ExpressionManager from './ExpressionManager'
import { SoundThumb } from './ExpressionPreviews'

const NO_SOUNDS: SoundboardItem[] = []

/** Os sons do servidor; carregou se a lista dele chegou. */
async function loadSounds(serverId: string): Promise<boolean> {
  await useSoundboardStore.getState().loadServerSounds(serverId)
  return useSoundboardStore.getState().soundsByServer[serverId] !== undefined
}

/** Sons da mesa de áudio do servidor aberto, nas configurações do servidor. */
export default function SoundsSection(): React.JSX.Element | null {
  const serverId = useServerStore((s) => s.currentServer?.id) ?? ''
  const sounds = useSoundboardStore((s) => s.soundsByServer[serverId] ?? NO_SOUNDS)
  const access = useExpressionAccess('sound')
  const { status, retry } = useExpressionLoad(useCallback(() => loadSounds(serverId), [serverId]))
  if (!serverId) return null
  return (
    <ExpressionManager
      kind="sound"
      items={sounds}
      status={status}
      onRetry={retry}
      canAdd={access.canAdd}
      canManage={access.canManage}
      preview={(s) => <SoundThumb emoji={s.emoji} />}
      meta={(s) => soundMeta(s.duration_ms, s.uploader_name)}
      emojiOf={(s) => s.emoji ?? ''}
      save={(s, values) => useSoundboardStore.getState().updateSound(serverId, s.id, values)}
      remove={(s) => useSoundboardStore.getState().deleteSound(serverId, s.id)}
      upload={(close) => <SoundboardUploadModal open serverId={serverId} onClose={close} />}
    />
  )
}
