import { Ionicons } from '@expo/vector-icons'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, fontSize, MIN_TOUCH, radius, spacing } from '../../../shared/theme/tokens'
import { Avatar } from '../../../shared/ui/Avatar'
import { Button } from '../../../shared/ui/Button'
import { ModalSheet } from '../../../shared/ui/ModalSheet'
import { STATUS_COLOR, type PresenceStatus } from '../../friends/lib/presenceStatus'
import { usePresenceStore } from '../../friends/store/presenceStore'
import { getServerDetail, type ServerDetail, type ServerMember } from '../api/members'
import { groupMembers, memberColorCss } from '../lib/memberGroups'

interface MembersSheetProps {
  serverId: string
  onClose: () => void
  onOpenProfile: (userId: string) => void
}

const nameOf = (m: ServerMember): string => m.nickname?.trim() || m.display_name || m.username || 'Usuário'

function MemberRow({ member, color, status, owner, onPress }: { member: ServerMember; color?: string; status: PresenceStatus; owner: boolean; onPress: () => void }) {
  const name = nameOf(member)
  const handle = `@${member.username ?? ''}`
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${handle}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View>
        <Avatar name={name} uri={member.avatar_url} size={36} />
        <View style={[styles.dot, { backgroundColor: STATUS_COLOR[status] }]} />
      </View>
      <View style={styles.texts}>
        <View style={styles.nameLine}>
          <Text numberOfLines={1} style={[styles.name, color ? { color } : null]}>
            {name}
          </Text>
          {owner ? (
            <View accessibilityLabel="Dono do servidor">
              <Ionicons name="ribbon" size={14} color={colors.yellow} />
            </View>
          ) : null}
          {member.is_bot ? <Text style={styles.bot}>BOT</Text> : null}
        </View>
        <Text numberOfLines={1} style={styles.handle}>
          {handle}
        </Text>
      </View>
    </Pressable>
  )
}

/** Membros do servidor numa folha (o ícone no canto do canal abre), agrupados como no Discord e na web. */
export function MembersSheet({ serverId, onClose, onOpenProfile }: MembersSheetProps) {
  const [detail, setDetail] = useState<ServerDetail | null>(null)
  const [error, setError] = useState(false)
  const statuses = usePresenceStore((s) => s.statuses)
  const loadPresence = usePresenceStore((s) => s.load)

  const load = useCallback(() => {
    setError(false)
    getServerDetail(serverId)
      .then((d) => {
        setDetail(d)
        void loadPresence(d.members.map((m) => m.user_id))
      })
      .catch(() => setError(true))
  }, [serverId, loadPresence])
  useEffect(load, [load])

  // Os bots o servidor já manda online na presença.
  const statusOf = (m: ServerMember): PresenceStatus => statuses[m.user_id] ?? 'offline'
  const roles = detail?.roles ?? []
  const groups = detail ? groupMembers({ members: detail.members, roles, isOnline: (id) => (statuses[id] ?? 'offline') !== 'offline' }) : []

  return (
    <ModalSheet title="Membros" onClose={onClose}>
      {error ? (
        <View style={styles.center}>
          <Text accessibilityRole="alert" style={styles.handle}>
            Não foi possível carregar os membros.
          </Text>
          <Button title="Tentar de novo" variant="secondary" onPress={load} />
        </View>
      ) : null}
      {!detail && !error ? <ActivityIndicator color={colors.brand} /> : null}
      {groups.map((group) => (
        <View key={group.key} style={[styles.group, group.key === 'offline' && styles.offline]}>
          <Text style={styles.groupTitle}>{`${group.title} — ${group.members.length}`}</Text>
          {group.members.map((m) => (
            <MemberRow
              key={m.user_id}
              member={m}
              color={memberColorCss(roles, m.role_ids)}
              status={statusOf(m)}
              owner={m.user_id === detail?.server.owner_id}
              onPress={() => onOpenProfile(m.user_id)}
            />
          ))}
        </View>
      ))}
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  center: { gap: spacing.md, alignItems: 'center', paddingVertical: spacing.lg },
  group: { gap: spacing.xs, marginBottom: spacing.lg },
  offline: { opacity: 0.6 },
  groupTitle: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.xs },
  row: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.xs, borderRadius: radius.md },
  pressed: { backgroundColor: colors.bgAccent },
  dot: { position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: colors.bgFloating },
  texts: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { color: colors.textStrong, fontSize: fontSize.md, fontWeight: '600', flexShrink: 1 },
  bot: { color: colors.white, fontSize: 10, fontWeight: '700', paddingHorizontal: 4, borderRadius: 4, backgroundColor: colors.brand, overflow: 'hidden' },
  handle: { color: colors.textMuted, fontSize: fontSize.sm }
})
