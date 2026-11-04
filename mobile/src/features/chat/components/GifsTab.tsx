import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, fontSize, radius, spacing } from '../../../shared/theme/tokens'
import type { GifItem } from '../api/gifs'

/** Aba "GIFs" do seletor: grade de 2 colunas com a prévia de cada GIF. */
function emptyMessage(loading: boolean, unavailable: boolean): string {
  if (loading) return 'Carregando GIFs…'
  return unavailable ? 'GIFs indisponíveis.' : 'Nenhum GIF encontrado.'
}

export function GifsTab({
  gifs,
  loading,
  unavailable = false,
  onSelect
}: {
  gifs: GifItem[]
  loading: boolean
  /** A busca falhou ou o servidor não tem chave da KLIPY. */
  unavailable?: boolean
  onSelect: (gif: GifItem) => void
}) {
  if (loading || gifs.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyMessage(loading, unavailable)}</Text>
      </View>
    )
  }
  return (
    <ScrollView contentContainerStyle={styles.grid} keyboardShouldPersistTaps="handled">
      {gifs.map((gif) => (
        <Pressable key={gif.id} accessibilityRole="button" accessibilityLabel={gif.title || 'GIF'} onPress={() => onSelect(gif)} style={styles.cell}>
          <Image source={{ uri: gif.preview_url || gif.url }} style={styles.image} resizeMode="cover" />
        </Pressable>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textFaint, fontSize: fontSize.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { width: '48%', height: 112, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' },
  image: { width: '100%', height: '100%' }
})
