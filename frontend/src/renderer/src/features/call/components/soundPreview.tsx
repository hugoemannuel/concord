import type { SoundboardItem } from '../api/soundboard'
import { SoundboardIcon } from '../../../shared/ui/icons'
import type { PickerPreview } from '../../emojis/components/ExpressionPicker'
import ServerIcon from '../../../shared/ui/ServerIcon'
import { itemPreview, type PickerServer } from '../../emojis/lib/pickerSections'

/** O rodapé da mesa com o som em foco: nome, de qual servidor ele é e o ícone dele. */
export function soundPreview(
  sound: (SoundboardItem & { server_name?: string }) | undefined,
  server: PickerServer | undefined
): PickerPreview | null {
  if (!sound) return null
  return {
    ...itemPreview(sound.name, server?.name ?? sound.server_name, false),
    media: sound.emoji || <SoundboardIcon size={20} className="text-muted" />,
    aside: server && <ServerIcon name={server.name} iconUrl={server.icon_url} lazy />
  }
}
