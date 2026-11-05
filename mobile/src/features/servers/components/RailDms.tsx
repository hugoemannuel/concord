import { Pressable, StyleSheet, View } from 'react-native'
import { MIN_TOUCH } from '../../../shared/theme/tokens'
import { Avatar } from '../../../shared/ui/Avatar'
import { UnreadBadge } from '../../chat/components/UnreadBadge'
import { type RailDm, unreadLabel } from '../../chat/lib/unreadCounts'

const SIZE = 48

/**
 * Logo abaixo do ícone de DMs, como no Discord: a foto de quem te mandou
 * mensagem no privado e ainda não foi lida, com a quantidade.
 */
export function RailDms({ dms, onOpen }: { dms: RailDm[]; onOpen: (dm: RailDm) => void }) {
  return (
    <>
      {dms.map((dm) => (
        <Pressable
          key={dm.id}
          accessibilityRole="button"
          accessibilityLabel={`${dm.title}, ${unreadLabel(dm.unread)}`}
          onPress={() => onOpen(dm)}
          style={styles.item}
        >
          <Avatar name={dm.title} uri={dm.avatarUrl} size={SIZE} />
          <View style={styles.badge}>
            <UnreadBadge count={dm.unread} />
          </View>
        </Pressable>
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  item: { width: SIZE, height: SIZE, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: -6, bottom: -6 }
})
