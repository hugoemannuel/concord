// Emojis personalizados no texto: vão como <:nome:id>, igual ao desktop
// (frontend/.../features/emojis/lib/emojiToken.ts).

const NAME = '[A-Za-z0-9_]{2,32}'
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

export interface EmojiPart {
  text: string
  emoji?: { id: string; name: string }
}

/** Separa os <:nome:id> do resto do texto. */
export function splitCustomEmojis(text: string): EmojiPart[] {
  if (!text.includes('<:')) return [{ text }]
  const parts: EmojiPart[] = []
  const re = new RegExp(`<:(${NAME}):(${UUID})>`, 'g')
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) })
    parts.push({ text: m[0], emoji: { name: m[1], id: m[2] } })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

export function emojiFileUrl(apiBaseUrl: string, emojiId: string, token: string): string {
  return `${apiBaseUrl}/emojis/${encodeURIComponent(emojiId)}/file?token=${encodeURIComponent(token)}`
}
