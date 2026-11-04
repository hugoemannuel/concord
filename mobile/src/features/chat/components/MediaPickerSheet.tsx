import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fontSize, MIN_TOUCH, radius, spacing } from '../../../shared/theme/tokens'
import type { GifItem } from '../api/gifs'
import type { ServerSticker } from '../api/stickers'
import { useGifSearch } from '../hooks/useGifSearch'
import { useServerStickers } from '../hooks/useServerStickers'
import { EmojisTab } from './EmojisTab'
import { GifsTab } from './GifsTab'
import { StickersTab } from './StickersTab'

type TabId = 'emojis' | 'gifs' | 'stickers'

// Mesmas abas, ícones e textos do seletor do desktop.
const TABS: { id: TabId; icon: string; label: string; placeholder: string }[] = [
  { id: 'emojis', icon: '😊', label: 'Emojis', placeholder: 'Buscar emoji…' },
  { id: 'gifs', icon: '👾', label: 'GIFs', placeholder: 'Buscar GIFs no GIPHY…' },
  { id: 'stickers', icon: '💟', label: 'Figurinhas', placeholder: 'Filtrar figurinhas…' }
]

interface MediaPickerSheetProps {
  /** Servidor do canal aberto (as figurinhas são do servidor); ausente na DM. */
  serverId?: string | null
  onSelectEmoji: (emoji: string) => void
  onSelectGif: (gif: GifItem) => void
  onSelectSticker: (sticker: ServerSticker) => void
  onClose: () => void
}

/** Seletor de emoji, GIF e figurinha: no celular a web abre como folha de baixo (MobileSheet), com fundo escurecido. */
export function MediaPickerSheet({ serverId, onSelectEmoji, onSelectGif, onSelectSticker, onClose }: MediaPickerSheetProps) {
  const [tab, setTab] = useState<TabId>('emojis')
  const [search, setSearch] = useState('')
  const { bottom } = useSafeAreaInsets()
  const { gifs, loading: loadingGifs } = useGifSearch(tab === 'gifs', search)
  const { stickers, loading: loadingStickers } = useServerStickers(serverId, tab === 'stickers')
  const active = TABS.find((t) => t.id === tab)!

  const pick = <T,>(handler: (value: T) => void) => (value: T): void => {
    handler(value)
    onClose()
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar seletor" />
      <View style={[styles.sheet, { paddingBottom: Math.max(spacing.md, bottom) }]}>
        <View accessibilityRole="tablist" style={styles.tabs}>
          {TABS.map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.id }}
              onPress={() => {
                setTab(t.id)
                setSearch('')
              }}
              style={[styles.tab, tab === t.id && styles.tabOn]}
            >
              <Text style={[styles.tabText, tab === t.id && styles.tabTextOn]}>
                {t.icon} {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          accessibilityLabel={active.placeholder}
          placeholder={active.placeholder}
          placeholderTextColor={colors.textFaint}
          value={search}
          onChangeText={setSearch}
          style={styles.search}
        />
        <View style={styles.content}>
          {tab === 'emojis' ? <EmojisTab search={search} onSelect={pick(onSelectEmoji)} /> : null}
          {tab === 'gifs' ? <GifsTab gifs={gifs} loading={loadingGifs} onSelect={pick(onSelectGif)} /> : null}
          {tab === 'stickers' ? (
            <StickersTab serverId={serverId} stickers={stickers} loading={loadingStickers} search={search} onSelect={pick(onSelectSticker)} />
          ) : null}
        </View>
        {tab === 'gifs' ? <Text style={styles.giphy}>Powered by GIPHY</Text> : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { height: '65%', maxHeight: 448, backgroundColor: '#14161a', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: spacing.md, gap: spacing.sm },
  tabs: { flexDirection: 'row', justifyContent: 'space-around', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', paddingBottom: spacing.sm },
  tab: { minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md },
  tabOn: { backgroundColor: 'rgba(255,255,255,0.1)' },
  tabText: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '500' },
  tabTextOn: { color: colors.white, fontWeight: '600' },
  search: { minHeight: MIN_TOUCH, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.4)', color: colors.white, fontSize: fontSize.sm, paddingHorizontal: spacing.md },
  content: { flex: 1 },
  giphy: { color: colors.textFaint, fontSize: 10, textAlign: 'center', letterSpacing: 1 }
})
