package message

import (
	"context"
	"encoding/json"
	"slices"

	"gin-quickstart/backend/internal/namestyle"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func MessageRepository(db *pgxpool.Pool) *Repository {
	return &Repository{
		db: db,
	}
}

var messageColumns = `
	m.id,
	m.author_id,
	u.username,
	u.display_name,
	u.avatar_url,
	` + namestyle.Expr("u") + `,
	m.channel_id,
	m.conversation_id,
	m.reply_to_id,
	m.content,
	m.system_kind,
	m.mention_everyone,
	m.created_at,
	m.edited_at,
	rm.id,
	rm.author_id,
	ru.username,
	ru.display_name,
	ru.avatar_url,
	` + namestyle.Expr("ru") + `,
	rm.content,
	m.sticker_id,
	stk.server_id,
	stk.name,
	stk.content_type,
	m.gif_url,
	m.gif_metadata
`

const messageFrom = `
	FROM messages m
	JOIN users u ON u.id = m.author_id
	LEFT JOIN messages rm ON rm.id = m.reply_to_id
	LEFT JOIN users ru ON ru.id = rm.author_id
	LEFT JOIN server_stickers stk ON stk.id = m.sticker_id
`

func (r *Repository) Create(ctx context.Context, msg *Message) error {
	var gifMetaBytes []byte
	if msg.GifMetadata != nil {
		gifMetaBytes, _ = json.Marshal(msg.GifMetadata)
	}
	return r.db.QueryRow(
		ctx,
		`
		INSERT INTO messages (id, author_id, channel_id, conversation_id, reply_to_id, content, system_kind, mention_everyone, sticker_id, gif_url, gif_metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING
			id,
			author_id,
			channel_id,
			conversation_id,
			reply_to_id,
			content,
			created_at
		`,
		msg.ID,
		msg.AuthorID,
		msg.ChannelID,
		msg.ConversationID,
		msg.ReplyToID,
		msg.Content,
		msg.SystemKind,
		msg.MentionEveryone,
		msg.StickerID,
		msg.GifURL,
		gifMetaBytes,
	).Scan(
		&msg.ID,
		&msg.AuthorID,
		&msg.ChannelID,
		&msg.ConversationID,
		&msg.ReplyToID,
		&msg.Content,
		&msg.CreatedAt,
	)
}

func (r *Repository) FindByID(ctx context.Context, id string) (*Message, error) {
	row := r.db.QueryRow(
		ctx,
		`
		SELECT `+messageColumns+`
		`+messageFrom+`
		WHERE m.id = $1
		`,
		id,
	)
	found, err := scanMessageRow(row)
	if err != nil {
		return nil, err
	}
	msg := &found

	msgs := []Message{*msg}
	if err := r.attachReactions(ctx, msgs); err != nil {
		return nil, err
	}
	*msg = msgs[0]
	return msg, nil
}

// listBeforeCondition é o cursor "before" (id da mensagem mais antiga já
// carregada): tudo que vem antes dela na ordem da lista, (created_at, id).
// Não dá para comparar só o id: é UUID v4, aleatório, e "id menor" trazia
// mensagens novas na página "anterior" (apareciam no topo da conversa) e
// pulava antigas. O id desempata mensagens no mesmo microssegundo.
const listBeforeCondition = `AND (m.created_at, m.id) < (
				SELECT b.created_at, b.id FROM messages b WHERE b.id = $2::uuid
			)`

func (r *Repository) ListByChannel(ctx context.Context, channelID string, limit int, before string) ([]Message, error) {
	var rows pgx.Rows
	var err error

	if before == "" {
		rows, err = r.db.Query(
			ctx,
			`
			SELECT `+messageColumns+`
			`+messageFrom+`
			WHERE m.channel_id = $1
			ORDER BY m.created_at DESC, m.id DESC
			LIMIT $2
			`,
			channelID,
			limit,
		)
	} else {
		rows, err = r.db.Query(
			ctx,
			`
			SELECT `+messageColumns+`
			`+messageFrom+`
			WHERE m.channel_id = $1
			`+listBeforeCondition+`
			ORDER BY m.created_at DESC, m.id DESC
			LIMIT $3
			`,
			channelID,
			before,
			limit,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages, err := scanMessages(rows)
	if err != nil {
		return nil, err
	}
	if err := r.attachReactions(ctx, messages); err != nil {
		return nil, err
	}
	return messages, nil
}

func (r *Repository) ListByConversation(ctx context.Context, conversationID string, limit int, before string) ([]Message, error) {
	var rows pgx.Rows
	var err error

	if before == "" {
		rows, err = r.db.Query(
			ctx,
			`
			SELECT `+messageColumns+`
			`+messageFrom+`
			WHERE m.conversation_id = $1
			ORDER BY m.created_at DESC, m.id DESC
			LIMIT $2
			`,
			conversationID,
			limit,
		)
	} else {
		rows, err = r.db.Query(
			ctx,
			`
			SELECT `+messageColumns+`
			`+messageFrom+`
			WHERE m.conversation_id = $1
			`+listBeforeCondition+`
			ORDER BY m.created_at DESC, m.id DESC
			LIMIT $3
			`,
			conversationID,
			before,
			limit,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages, err := scanMessages(rows)
	if err != nil {
		return nil, err
	}
	if err := r.attachReactions(ctx, messages); err != nil {
		return nil, err
	}
	return messages, nil
}

// UpdateContent troca o texto (e o mention_everyone) de uma mensagem do
// autor e marca edited_at. Mensagem de outro autor (ou que sumiu) não muda e
// dá ErrMessageNotFound.
func (r *Repository) UpdateContent(ctx context.Context, id string, authorID string, content string, mentionEveryone *string) error {
	tag, err := r.db.Exec(
		ctx,
		`
		UPDATE messages
		SET content = $3, mention_everyone = $4, edited_at = NOW()
		WHERE id = $1 AND author_id = $2
		`,
		id,
		authorID,
		content,
		mentionEveryone,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrMessageNotFound
	}
	return nil
}

func (r *Repository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(
		ctx,
		`DELETE FROM messages WHERE id = $1`,
		id,
	)
	return err
}

func (r *Repository) AddReaction(ctx context.Context, messageID string, userID string, emoji string) (bool, error) {
	tag, err := r.db.Exec(
		ctx,
		`
		INSERT INTO message_reactions (message_id, user_id, emoji)
		VALUES ($1, $2, $3)
		ON CONFLICT (message_id, user_id, emoji) DO NOTHING
		`,
		messageID,
		userID,
		emoji,
	)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (r *Repository) RemoveReaction(ctx context.Context, messageID string, userID string, emoji string) (bool, error) {
	tag, err := r.db.Exec(
		ctx,
		`DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
		messageID,
		userID,
		emoji,
	)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func GroupReactions(rows []ReactionRow) map[string][]ReactionSummary {
	byMessage := make(map[string][]ReactionSummary)
	indexByMessageEmoji := make(map[string]map[string]int)

	for _, row := range rows {
		emojiMap, ok := indexByMessageEmoji[row.MessageID]
		if !ok {
			emojiMap = make(map[string]int)
			indexByMessageEmoji[row.MessageID] = emojiMap
		}

		if idx, exists := emojiMap[row.Emoji]; exists {
			summary := &byMessage[row.MessageID][idx]
			if !slices.Contains(summary.UserIDs, row.UserID) {
				summary.UserIDs = append(summary.UserIDs, row.UserID)
				summary.Count = len(summary.UserIDs)
			}
		} else {
			emojiMap[row.Emoji] = len(byMessage[row.MessageID])
			byMessage[row.MessageID] = append(byMessage[row.MessageID], ReactionSummary{
				Emoji:   row.Emoji,
				Count:   1,
				UserIDs: []string{row.UserID},
			})
		}
	}

	return byMessage
}

func (r *Repository) attachReactions(ctx context.Context, messages []Message) error {
	for i := range messages {
		if messages[i].Reactions == nil {
			messages[i].Reactions = []ReactionSummary{}
		}
	}
	if len(messages) == 0 {
		return nil
	}

	ids := make([]string, len(messages))
	for i, m := range messages {
		ids[i] = m.ID
	}

	rows, err := r.db.Query(
		ctx,
		`
		SELECT message_id, user_id, emoji
		FROM message_reactions
		WHERE message_id = ANY($1::uuid[])
		ORDER BY created_at ASC
		`,
		ids,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	var reactionRows []ReactionRow
	for rows.Next() {
		var row ReactionRow
		if err := rows.Scan(&row.MessageID, &row.UserID, &row.Emoji); err != nil {
			return err
		}
		reactionRows = append(reactionRows, row)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	grouped := GroupReactions(reactionRows)
	for i := range messages {
		if summaries, ok := grouped[messages[i].ID]; ok {
			messages[i].Reactions = summaries
		}
	}

	return nil
}

type rowScanner interface {
	Next() bool
	Scan(dest ...interface{}) error
}

func populateMedia(msg *Message, stickerServerID, stickerName, stickerContentType *string, rawGifMeta []byte) {
	if msg.StickerID != nil && stickerName != nil && stickerServerID != nil && stickerContentType != nil {
		msg.Sticker = &StickerPreview{
			ID:          *msg.StickerID,
			ServerID:    *stickerServerID,
			Name:        *stickerName,
			ContentType: *stickerContentType,
		}
	}
	if len(rawGifMeta) > 0 {
		var gm GifMetadata
		if err := json.Unmarshal(rawGifMeta, &gm); err == nil {
			msg.GifMetadata = &gm
		}
	}
}

func scanMessages(rows rowScanner) ([]Message, error) {
	var messages []Message
	for rows.Next() {
		msg, err := scanMessageRow(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}

	if messages == nil {
		messages = []Message{}
	}

	return messages, nil
}

// scanMessageRow lê uma linha de messageColumns; extra recebe as colunas
// que vierem depois delas.
func scanMessageRow(rows interface {
	Scan(dest ...interface{}) error
}, extra ...any) (Message, error) {
	var msg Message
	var replyID, replyAuthorID, replyUsername, replyDisplayName, replyContent *string
	var replyAvatarURL *string
	var replyStyle namestyle.Style
	var stickerServerID, stickerName, stickerContentType *string
	var rawGifMeta []byte

	msg.Author = &Author{}
	dest := []any{
		&msg.ID,
		&msg.AuthorID,
		&msg.Author.Username,
		&msg.Author.DisplayName,
		&msg.Author.AvatarURL,
		&msg.Author.NameStyle,
		&msg.ChannelID,
		&msg.ConversationID,
		&msg.ReplyToID,
		&msg.Content,
		&msg.SystemKind,
		&msg.MentionEveryone,
		&msg.CreatedAt,
		&msg.EditedAt,
		&replyID,
		&replyAuthorID,
		&replyUsername,
		&replyDisplayName,
		&replyAvatarURL,
		&replyStyle,
		&replyContent,
		&msg.StickerID,
		&stickerServerID,
		&stickerName,
		&stickerContentType,
		&msg.GifURL,
		&rawGifMeta,
	}
	if err := rows.Scan(append(dest, extra...)...); err != nil {
		return Message{}, err
	}
	msg.Author.ID = msg.AuthorID

	if replyID != nil && replyAuthorID != nil && replyUsername != nil && replyDisplayName != nil && replyContent != nil {
		msg.ReplyTo = &ReplyPreview{
			ID:       *replyID,
			AuthorID: *replyAuthorID,
			Author: &Author{
				ID:          *replyAuthorID,
				Username:    *replyUsername,
				DisplayName: *replyDisplayName,
				AvatarURL:   replyAvatarURL,
				NameStyle:   replyStyle,
			},
			Content: *replyContent,
		}
	}

	populateMedia(&msg, stickerServerID, stickerName, stickerContentType, rawGifMeta)
	return msg, nil
}
