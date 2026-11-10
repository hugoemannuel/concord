import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, fontSize, spacing } from '../../../shared/theme/tokens'
import type { ForwardedFrom } from '../api/messages'
import { forwardedLabel } from '../lib/forward'

/** Conteúdo da encaminhada com a barra à esquerda e a origem; mensagem comum passa direto. */
export function ForwardedFrame({ from, children }: { from?: ForwardedFrom | null; children: ReactNode }) {
  if (!from) return <>{children}</>
  return (
    <View style={styles.frame}>
      <Text style={styles.label} numberOfLines={1}>
        <Text style={styles.tag}>Encaminhada</Text> <Text>{forwardedLabel(from)}</Text>
      </Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { borderLeftWidth: 2, borderLeftColor: colors.borderStrong, paddingLeft: spacing.md, marginTop: 2 },
  label: { color: colors.textMuted, fontSize: fontSize.xs },
  tag: { fontStyle: 'italic', fontWeight: '600' }
})
