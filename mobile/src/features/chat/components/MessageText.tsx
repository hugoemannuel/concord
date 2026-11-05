import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, Image, StyleSheet, Text } from 'react-native'
import { API_BASE_URL } from '../../../shared/lib/config'
import { colors, fontSize } from '../../../shared/theme/tokens'
import type { ExpressionOrigin } from '../api/expressions'
import { emojiFileUrl, splitCustomEmojis } from '../lib/emojiToken'
import { requestEmojiOrigin, useEmojiOrigins } from '../store/emojiOrigins'
import { ensureMediaToken } from '../store/mediaToken'

/** O texto de origem. Servidor privado, para quem não é membro, não tem nome. */
export function originText(origin: ExpressionOrigin | undefined): string {
  if (origin?.private) return 'de um servidor privado'
  return origin?.server_name ? `de ${origin.server_name}` : 'de outro servidor'
}

/** URL do emoji, só depois de saber que ele pode aparecer. */
function useEmojiImage(id: string, visible: boolean): string | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    ensureMediaToken()
      .then((token) => {
        if (!cancelled) setSrc(emojiFileUrl(API_BASE_URL, id, token))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id, visible])
  return src
}

/** Emoji no meio do texto. Apagado, sem acesso ou carregando: fica o :nome:. Tocar diz de onde veio. */
function InlineEmoji({ id, name }: { id: string; name: string }) {
  const entry = useEmojiOrigins((s) => s.byId[id])
  useEffect(() => requestEmojiOrigin(id), [id])
  const visible = Boolean(entry && !entry.deleted)
  const src = useEmojiImage(id, visible)
  const label = `:${name}:`
  if (!visible || !src) return <Text>{label}</Text>
  return (
    <Text accessibilityRole="button" accessibilityLabel={label} onPress={() => Alert.alert(label, originText(entry?.origin))}>
      <Image source={{ uri: src }} style={styles.emoji} />
    </Text>
  )
}

/** Texto da mensagem, com os emojis personalizados no lugar do token. */
export function MessageText({ content, children }: { content: string; children?: ReactNode }) {
  const parts = useMemo(() => splitCustomEmojis(content), [content])
  return (
    <Text style={styles.content}>
      {parts.map((part, i) => (part.emoji ? <InlineEmoji key={i} id={part.emoji.id} name={part.emoji.name} /> : part.text))}
      {children}
    </Text>
  )
}

const styles = StyleSheet.create({
  content: { color: colors.textNormal, fontSize: fontSize.md, lineHeight: 22 },
  emoji: { width: 22, height: 22 }
})
