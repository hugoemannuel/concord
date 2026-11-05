import { Ionicons } from '@expo/vector-icons'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { colors, MIN_TOUCH, radius, spacing } from '../../../shared/theme/tokens'
import { Avatar } from '../../../shared/ui/Avatar'
import { PathIcon } from '../../../shared/ui/PathIcon'
import { DIAMOND_PATHS } from '../../../shared/ui/icons/hubIcons'
import { UnreadBadge, UnreadDot } from '../../chat/components/UnreadBadge'
import type { Server } from '../api/servers'
import type { RailDm } from '../../chat/lib/unreadCounts'
import { RailDms } from './RailDms'

interface ServerRailProps {
  servers: Server[]
  /** Servidor aberto; null = área de DMs. */
  selectedId: string | null
  onSelect: (serverId: string | null) => void
  /** Total de DMs não lidas (selo no ícone de DMs). */
  dmUnread?: number
  /** Não lidas por servidor (só na sessão): o ícone ganha um ponto. */
  unreadServers?: Record<string, number>
  /** O diamante logo abaixo das DMs (como na web): Melhorias (Novidades e Rank global; Propostas em breve). */
  onOpenHub?: () => void
  /** DMs não lidas que aparecem logo abaixo do ícone de DMs (foto e quantidade). */
  unreadDms?: RailDm[]
  onOpenDm?: (dm: RailDm) => void
}

const NO_DMS: RailDm[] = []
const noop = () => {}

const SIZE = 48

/** Trilho da esquerda: ícone de DMs no topo e um botão por servidor. */
export function ServerRail({ servers, selectedId, onSelect, dmUnread = 0, unreadServers = {}, onOpenHub, unreadDms = NO_DMS, onOpenDm = noop }: ServerRailProps) {
  return (
    <ScrollView style={styles.rail} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mensagens diretas"
        accessibilityState={{ selected: selectedId === null }}
        onPress={() => onSelect(null)}
        style={[styles.item, styles.home, selectedId === null && styles.selected]}
      >
        <Ionicons name="chatbubble" size={24} color={colors.white} />
        {dmUnread > 0 ? (
          <View style={styles.badge}>
            <UnreadBadge count={dmUnread} />
          </View>
        ) : null}
      </Pressable>
      <RailDms dms={unreadDms} onOpen={onOpenDm} />
      <View style={styles.divider} />
      {onOpenHub ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Melhorias" onPress={onOpenHub} style={[styles.item, styles.hub]}>
          <PathIcon paths={DIAMOND_PATHS} color={colors.textBrand} size={24} />
        </Pressable>
      ) : null}
      {servers.map((server) => (
        <Pressable
          key={server.id}
          accessibilityRole="button"
          accessibilityLabel={server.name}
          accessibilityState={{ selected: selectedId === server.id }}
          onPress={() => onSelect(server.id)}
          style={styles.item}
        >
          <Avatar name={server.name} uri={server.icon_url} size={SIZE} square />
          {(unreadServers[server.id] ?? 0) > 0 ? (
            <View style={styles.dot}>
              <UnreadDot />
            </View>
          ) : null}
        </Pressable>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  rail: { width: 72, backgroundColor: colors.bgTertiary, flexGrow: 0 },
  content: { alignItems: 'center', paddingVertical: spacing.md, gap: spacing.sm },
  item: { width: SIZE, height: SIZE, minHeight: MIN_TOUCH, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  home: { backgroundColor: colors.bgAccent },
  selected: { backgroundColor: colors.brand },
  hub: { backgroundColor: colors.bgAccent },
  badge: { position: 'absolute', right: -6, bottom: -6 },
  dot: { position: 'absolute', left: -10, top: SIZE / 2 - 4 },
  divider: { width: 32, height: 2, borderRadius: 1, backgroundColor: colors.borderSubtle }
})
