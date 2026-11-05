import type { EmoteItem } from '../../chat/lib/emotes'
import type { CustomEmoji as Emoji, ServerEmojis } from '../api/emojis'
import { customIdOf, itemPreview } from '../lib/pickerSections'
import CustomEmoji from './CustomEmoji'
import type { PickerPreview } from './ExpressionPicker'

/** O rodapé de um emoji: o nome e, no personalizado, de que servidor vem e se pode ser usado. */
export function emojiPreview(
  key: string,
  serverOf: Map<string, ServerEmojis>,
  unicode: Map<string, EmoteItem>,
  isDisabled: (emoji: Emoji) => boolean
): PickerPreview | null {
  const id = customIdOf(key)
  if (id === null) return { media: key, title: unicode.get(key)?.label ?? key }
  const group = serverOf.get(id)
  const emoji = group?.emojis.find((e) => e.id === id)
  if (!emoji) return null
  return {
    ...itemPreview(`:${emoji.name}:`, group?.server_name, isDisabled(emoji)),
    media: <CustomEmoji id={id} name={emoji.name} size="picker" />
  }
}
