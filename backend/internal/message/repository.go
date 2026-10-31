package message

import (
	"context"
	"encoding/json"

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
	u.avatar_decoration_url,
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
	ru.avatar_decoration_url,
	rm.content,
	m.sticker_id,
	stk.server_id,
	stk.name,
	stk.content_type,
	m.gif_url,
	m.gif_metadata,
	m.tts,
	m.tts_voice_channel_id,
	m.call_invite
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
		INSERT INTO messages (id, author_id, channel_id, conversation_id, reply_to_id, content, system_kind, mention_everyone, sticker_id, gif_url, gif_metadata, call_invite, tts, tts_voice_channel_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
		callInviteBytes(msg.CallInvite),
		msg.TTS,
		msg.TTSVoiceChannelID,
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
	msg, err := r.findOne(ctx, id)
	if err != nil {
		return nil, err
	}
	msgs := []Message{*msg}
	if err := r.attachReactions(ctx, msgs); err != nil {
		return nil, err
	}
	return &msgs[0], nil
}

// FindNewByID relê uma mensagem que acabou de ser gravada: sem buscar as
// reações, que ela ainda não pode ter (uma consulta a menos por envio).
func (r *Repository) FindNewByID(ctx context.Context, id string) (*Message, error) {
	return r.findOne(ctx, id)
}

func (r *Repository) findOne(ctx context.Context, id string) (*Message, error) {
	row := r.db.QueryRow(
		ctx,
		`
		SELECT `+messageColumns+`
		`+messageFrom+`
		WHERE m.id = $1
		`,
		id,
	)
	msg, err := scanMessageRow(row)
	if err != nil {
		return nil, err
	}
	return &msg, nil
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
