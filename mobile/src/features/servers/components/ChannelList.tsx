import { Ionicons } from '@expo/vector-icons'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, fontSize, MIN_TOUCH, radius, spacing } from '../../../shared/theme/tokens'
import { Banner } from '../../../shared/ui/Banner'
import { Button } from '../../../shared/ui/Button'
import type { CallUser } from '../../call/lib/callTypes'
import { UnreadDot } from '../../chat/components/UnreadBadge'
import type { Channel, ChannelLayout } from '../api/channels'
import { channelSections } from '../lib/channelSections'

interface ChannelListProps {
  serverName: string
  channels: Channel[]
  /** A organização da barra (sem ela, os canais aparecem por tipo). */
  layout?: ChannelLayout | null
  /** A lista de canais deste servidor falhou ao carregar. */
  error: boolean
  /** Não lidas por canal (só na sessão): o nome fica em negrito e ganha um ponto. */
  unreadChannels?: Record<string, number>
  /** Quem está em cada canal de voz (id do canal -> pessoas). */
  voiceMembers?: Record<string, CallUser[]>
  onOpenChannel: (channel: Channel) => void
  /** Entrar na chamada do canal de voz. */
  onJoinVoice?: (channel: Channel) => void
  onRetry: () => void
}

interface ChannelRowProps {
  channel: Channel
  unread: boolean
  members: CallUser[]
  onPress: () => void
}

/** Um canal: ícone (# ou alto-falante), nome, ponto de não lida e, nos de voz, quem está lá dentro. */
function ChannelRow({ channel, unread, members, onPress }: ChannelRowProps) {
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={channel.name}
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {channel.type === 'voice' ? (
          <Ionicons name="volume-high" size={20} color={colors.interactiveNormal} />
        ) : (
          <Text style={styles.hash}>#</Text>
        )}
        <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>
          {channel.name}
        </Text>
        {unread ? <UnreadDot /> : null}
      </Pressable>
      {members.map((member) => (
        <Text key={member.id} style={styles.member} numberOfLines={1}>
          {member.display_name}
        </Text>
      ))}
    </View>
  )
}

/** Coluna do meio: nome do servidor, os canais soltos e as categorias. */
export function ChannelList({ serverName, channels, layout, error, unreadChannels = {}, voiceMembers = {}, onOpenChannel, onJoinVoice, onRetry }: ChannelListProps) {
  const open = (channel: Channel): void => (channel.type === 'voice' ? onJoinVoice?.(channel) : onOpenChannel(channel))

  return (
    <View style={styles.container}>
      <Text style={styles.server} numberOfLines={1}>
        {serverName}
      </Text>
      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <View style={styles.error}>
            <Banner message="Não foi possível carregar os canais." />
            <Button title="Tentar de novo" onPress={onRetry} variant="secondary" />
          </View>
        ) : null}
        {channelSections(channels, layout).map((section) => (
          <View key={section.key}>
            {section.title ? <Text style={styles.section}>{section.title}</Text> : null}
            {section.channels.map((channel) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                unread={(unreadChannels[channel.id] ?? 0) > 0}
                members={voiceMembers[channel.id] ?? []}
                onPress={() => open(channel)}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, borderTopLeftRadius: radius.lg },
  server: { color: colors.textStrong, fontSize: fontSize.lg, fontWeight: '700', padding: spacing.lg },
  content: { paddingHorizontal: spacing.sm, paddingBottom: spacing.xl, gap: spacing.sm },
  section: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700', padding: spacing.sm },
  row: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  pressed: { backgroundColor: colors.bgAccent },
  hash: { color: colors.interactiveNormal, fontSize: fontSize.lg, width: 20, textAlign: 'center' },
  name: { color: colors.textSecondary, fontSize: fontSize.md, flexShrink: 1 },
  nameUnread: { color: colors.textStrong, fontWeight: '700' },
  member: { color: colors.textMuted, fontSize: fontSize.sm, paddingLeft: spacing.xxl + spacing.sm, paddingVertical: spacing.xs },
  error: { gap: spacing.sm, padding: spacing.sm }
})
