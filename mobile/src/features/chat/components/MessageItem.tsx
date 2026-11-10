import { StyleSheet, Text, View } from 'react-native'
import { colors, fontSize, spacing } from '../../../shared/theme/tokens'
import { Avatar } from '../../../shared/ui/Avatar'
import { MessageAttachments } from './MessageAttachments'
import { MessageGif } from './MessageGif'
import { MessageSticker } from './MessageSticker'
import { MessageText } from './MessageText'
import { dayLabelText, timeLabel } from '../lib/dayLabel'
import type { GroupedMessage } from '../lib/messageGroups'
import { isMaestroMessageKind } from '../../music/lib/music'
import { MusicMessage } from '../../music/components/MusicMessage'
import { ProfileTap } from '../../profile/components/ProfileTap'
import { ForwardedFrame } from './ForwardedFrame'

interface MessageItemProps {
  item: GroupedMessage
  timeZone?: string
  /** Tocar no avatar ou no nome do autor abre o perfil dele. */
  onOpenProfile?: (userId: string) => void
}

export function MessageItem({ item, timeZone, onOpenProfile }: MessageItemProps) {
  const { message, showHeader, dayLabel } = item
  const name = message.author?.display_name ?? 'Usuário'
  if (isMaestroMessageKind(message.system_kind)) {
    return <MusicMessage content={message.content} createdAt={message.created_at} timeZone={timeZone} />
  }
  return (
    <View>
      {dayLabel ? (
        <View style={styles.day}>
          <View style={styles.line} />
          <Text style={styles.dayText}>{dayLabelText(dayLabel)}</Text>
          <View style={styles.line} />
        </View>
      ) : null}
      <View style={[styles.row, showHeader && styles.withHeader]}>
        <View style={styles.gutter}>
          {showHeader ? (
            <ProfileTap userId={message.author_id} label={name} onOpen={onOpenProfile}>
              <Avatar name={name} uri={message.author?.avatar_url} size={40} />
            </ProfileTap>
          ) : null}
        </View>
        <View style={styles.body}>
          {showHeader ? (
            <View style={styles.head}>
              <ProfileTap userId={message.author_id} label={name} onOpen={onOpenProfile}>
                <Text style={styles.author}>{name}</Text>
              </ProfileTap>
              <Text style={styles.time}>{timeLabel(message.created_at, new Date(), timeZone)}</Text>
            </View>
          ) : null}
          <ForwardedFrame from={message.forwarded_from}>
            {message.content.trim() ? (
              <MessageText content={message.content}>
                {message.edited_at ? <Text style={styles.edited}> (editada)</Text> : null}
              </MessageText>
            ) : null}
            {message.sticker ? <MessageSticker sticker={message.sticker} /> : null}
            {message.deleted_sticker_name ? <Text style={styles.deletedSticker}>:{message.deleted_sticker_name}:</Text> : null}
            {message.gif_url ? <MessageGif gifUrl={message.gif_url} metadata={message.gif_metadata} /> : null}
            {message.attachments?.length ? <MessageAttachments attachments={message.attachments} /> : null}
          </ForwardedFrame>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: 1 },
  withHeader: { marginTop: spacing.md },
  gutter: { width: 40, marginRight: spacing.md },
  body: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  author: { color: colors.textStrong, fontSize: fontSize.md, fontWeight: '700' },
  time: { color: colors.textFaint, fontSize: fontSize.xs },
  deletedSticker: { color: colors.textMuted, fontSize: fontSize.md, lineHeight: 22 },
  edited: { color: colors.textFaint, fontSize: fontSize.xs },
  day: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, marginTop: spacing.lg },
  line: { flex: 1, height: 1, backgroundColor: colors.borderSubtle },
  dayText: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600' }
})
