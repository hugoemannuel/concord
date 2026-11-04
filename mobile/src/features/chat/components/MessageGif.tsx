import { useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { colors, fontSize, radius, spacing } from '../../../shared/theme/tokens'
import type { GifMetadata } from '../api/messages'
import { fitGif } from '../lib/attachments'

interface MessageGifProps {
  gifUrl: string
  metadata?: GifMetadata | null
}

/** GIF: caixa na proporção, selo "GIF" no canto e aviso se não carregar (igual ao desktop). */
export function MessageGif({ gifUrl, metadata }: MessageGifProps) {
  const [failed, setFailed] = useState(false)
  const box = fitGif(metadata?.width, metadata?.height) ?? { width: 240, height: 180 }
  if (failed) {
    return (
      <View style={styles.failed}>
        <Text style={styles.failedText}>GIF indisponível</Text>
      </View>
    )
  }
  return (
    <View style={[styles.box, box]}>
      <Image source={{ uri: gifUrl }} accessibilityLabel="GIF" style={styles.image} resizeMode="cover" onError={() => setFailed(true)} />
      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.badgeText}>GIF</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { marginVertical: spacing.xs, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.3)', maxWidth: '100%' },
  image: { width: '100%', height: '100%' },
  badge: { position: 'absolute', left: spacing.sm, bottom: spacing.sm, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  failed: { marginVertical: spacing.xs, width: 192, height: 128, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderNormal, backgroundColor: 'rgba(255,255,255,0.05)' },
  failedText: { color: colors.textFaint, fontSize: fontSize.xs }
})
