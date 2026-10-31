package conversation

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func ConversationRepository(db *pgxpool.Pool) *Repository {
	return &Repository{
		db: db,
	}
}

// convColumns e scanConversation andam juntos: a ordem é a do Scan.
const convColumns = `
	c.id,
	c.type,
	c.name,
	c.icon_url,
	c.owner_id,
	c.user_a_id,
	c.user_b_id,
	c.created_at,
	c.updated_at
`

func scanConversation(row pgx.Row, extra ...any) (*Conversation, error) {
	conv := &Conversation{}
	var userA, userB *string
	dest := append([]any{
		&conv.ID,
		&conv.Type,
		&conv.Name,
		&conv.IconURL,
		&conv.OwnerID,
		&userA,
		&userB,
		&conv.CreatedAt,
		&conv.UpdatedAt,
	}, extra...)
	if err := row.Scan(dest...); err != nil {
		return nil, err
	}
	if userA != nil {
		conv.UserAID = *userA
	}
	if userB != nil {
		conv.UserBID = *userB
	}
	return conv, nil
}

// CreateDM cria a DM 1:1. Quem abriu já vê a conversa; o outro só quando
// chegar a primeira mensagem (como no Discord).
func (r *Repository) CreateDM(ctx context.Context, conv *Conversation, openerID string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	created, err := scanConversation(tx.QueryRow(
		ctx,
		`
		INSERT INTO conversations AS c (id, type, user_a_id, user_b_id)
		VALUES ($1, 'dm', $2, $3)
		RETURNING `+convColumns,
		conv.ID,
		conv.UserAID,
		conv.UserBID,
	))
	if err != nil {
		return err
	}
	if _, err := tx.Exec(
		ctx,
		`
		INSERT INTO conversation_members (conversation_id, user_id, hidden)
		VALUES ($1::uuid, $2::uuid, $2::uuid <> $4::uuid), ($1::uuid, $3::uuid, $3::uuid <> $4::uuid)
		`,
		conv.ID,
		conv.UserAID,
		conv.UserBID,
		openerID,
	); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	*conv = *created
	return nil
}

// CreateGroup cria o grupo com o dono e os convidados, todos vendo a conversa.
func (r *Repository) CreateGroup(ctx context.Context, conv *Conversation, memberIDs []string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	created, err := scanConversation(tx.QueryRow(
		ctx,
		`
		INSERT INTO conversations AS c (id, type, name, owner_id)
		VALUES ($1, 'group', $2, $3)
		RETURNING `+convColumns,
		conv.ID,
		conv.Name,
		conv.OwnerID,
	))
	if err != nil {
		return err
	}
	if _, err := tx.Exec(
		ctx,
		`
		INSERT INTO conversation_members (conversation_id, user_id)
		SELECT $1, unnest($2::uuid[])
		`,
		conv.ID,
		memberIDs,
	); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	*conv = *created
	return nil
}

func (r *Repository) FindByPair(ctx context.Context, userAID string, userBID string) (*Conversation, error) {
	return scanConversation(r.db.QueryRow(
		ctx,
		`SELECT `+convColumns+` FROM conversations c WHERE c.user_a_id = $1 AND c.user_b_id = $2`,
		userAID,
		userBID,
	))
}

func (r *Repository) FindByID(ctx context.Context, id string) (*Conversation, error) {
	return scanConversation(r.db.QueryRow(
		ctx,
		`SELECT `+convColumns+` FROM conversations c WHERE c.id = $1`,
		id,
	))
}

func (r *Repository) SetHidden(ctx context.Context, conversationID string, userID string, hidden bool) error {
	_, err := r.db.Exec(
		ctx,
		`UPDATE conversation_members SET hidden = $3 WHERE conversation_id = $1 AND user_id = $2`,
		conversationID,
		userID,
		hidden,
	)
	return err
}

// RevealConversation reabre a conversa para todos (chegou mensagem nova).
func (r *Repository) RevealConversation(ctx context.Context, conversationID string) error {
	_, err := r.db.Exec(
		ctx,
		`UPDATE conversation_members SET hidden = FALSE WHERE conversation_id = $1 AND hidden`,
		conversationID,
	)
	return err
}

// MarkRead marca como lido até a mensagem (ou até agora, sem mensagem).
// Nunca volta atrás.
func (r *Repository) MarkRead(ctx context.Context, conversationID string, userID string, messageID string) error {
	if messageID == "" {
		_, err := r.db.Exec(
			ctx,
			`UPDATE conversation_members SET last_read_at = GREATEST(last_read_at, NOW())
			WHERE conversation_id = $1 AND user_id = $2`,
			conversationID,
			userID,
		)
		return err
	}
	_, err := r.db.Exec(
		ctx,
		`
		UPDATE conversation_members cm
		SET last_read_at = GREATEST(cm.last_read_at, m.created_at)
		FROM messages m
		WHERE cm.conversation_id = $1 AND cm.user_id = $2
		AND m.id = $3 AND m.conversation_id = $1
		`,
		conversationID,
		userID,
		messageID,
	)
	return err
}

func (r *Repository) Rename(ctx context.Context, conversationID string, name string) error {
	_, err := r.db.Exec(
		ctx,
		`UPDATE conversations SET name = $2, updated_at = NOW() WHERE id = $1`,
		conversationID,
		name,
	)
	return err
}

// SetIcon troca o ícone do grupo e devolve o antigo (para apagar o arquivo).
func (r *Repository) SetIcon(ctx context.Context, conversationID string, url *string) (*string, error) {
	var old *string
	err := r.db.QueryRow(
		ctx,
		`
		UPDATE conversations c SET icon_url = $2, updated_at = NOW()
		FROM (SELECT icon_url FROM conversations WHERE id = $1 FOR UPDATE) prev
		WHERE c.id = $1
		RETURNING prev.icon_url
		`,
		conversationID,
		url,
	).Scan(&old)
	return old, err
}

func (r *Repository) AddMembers(ctx context.Context, conversationID string, userIDs []string) error {
	_, err := r.db.Exec(
		ctx,
		`
		INSERT INTO conversation_members (conversation_id, user_id)
		SELECT $1, unnest($2::uuid[])
		ON CONFLICT DO NOTHING
		`,
		conversationID,
		userIDs,
	)
	return err
}

func (r *Repository) RemoveMember(ctx context.Context, conversationID string, userID string) error {
	_, err := r.db.Exec(
		ctx,
		`DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
		conversationID,
		userID,
	)
	return err
}

func (r *Repository) SetOwner(ctx context.Context, conversationID string, ownerID string) error {
	_, err := r.db.Exec(
		ctx,
		`UPDATE conversations SET owner_id = $2, updated_at = NOW() WHERE id = $1`,
		conversationID,
		ownerID,
	)
	return err
}

func (r *Repository) Delete(ctx context.Context, conversationID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM conversations WHERE id = $1`, conversationID)
	return err
}

// ListByUserID lista as conversas abertas (não fechadas) da pessoa, da mais
// recente para a mais antiga, com participantes, última mensagem e não
// lidas.
func (r *Repository) ListByUserID(ctx context.Context, userID string) ([]Summary, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT `+convColumns+`,
			(
				`+membersJSONColumn+`
			),
			(
				SELECT COUNT(*)
				FROM messages m
				WHERE m.conversation_id = c.id
				AND m.created_at > cm.last_read_at
				AND m.author_id <> $1
			),
			lm.id,
			lm.author_id,
			lm.content,
			lm.created_at
		FROM conversation_members cm
		JOIN conversations c ON c.id = cm.conversation_id
		LEFT JOIN LATERAL (
			-- Mensagem só com enquete: a prévia mostra a pergunta. Só com
			-- anexos: o mesmo rótulo do attachmentLabel do app.
			SELECT m.id, m.author_id, COALESCE(
				NULLIF(m.content, ''),
				'📊 ' || p.question,
				CASE
					WHEN m.sticker_id IS NOT NULL THEN '💟 Figurinha'
					WHEN m.gif_url IS NOT NULL THEN '👾 GIF'
				END,
				(
					SELECT CASE
						WHEN COUNT(*) = 0 THEN NULL
						WHEN COUNT(*) > 1 THEN '📎 ' || COUNT(*) || ' anexos'
						WHEN MIN(a.kind) = 'image' THEN '🖼️ Imagem'
						WHEN MIN(a.kind) = 'video' THEN '🎬 Vídeo'
						ELSE '🎤 Áudio'
					END
					FROM message_attachments a
					WHERE a.message_id = m.id
				),
				''
			) AS content, m.created_at
			FROM messages m
			LEFT JOIN polls p ON p.message_id = m.id
			WHERE m.conversation_id = c.id
			ORDER BY m.created_at DESC
			LIMIT 1
		) lm ON TRUE
		WHERE cm.user_id = $1 AND NOT cm.hidden
		ORDER BY COALESCE(lm.created_at, c.created_at) DESC
		`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	summaries := []Summary{}
	for rows.Next() {
		var membersJSON []byte
		var unread int
		var lmID *string
		var lmAuthorID *string
		var lmContent *string
		var lmCreatedAt *time.Time

		conv, err := scanConversation(rows, &membersJSON, &unread, &lmID, &lmAuthorID, &lmContent, &lmCreatedAt)
		if err != nil {
			return nil, err
		}

		s := Summary{Conversation: *conv, UnreadCount: unread}
		if err := json.Unmarshal(membersJSON, &s.Members); err != nil {
			return nil, err
		}
		if !conv.IsGroup() {
			for i := range s.Members {
				if s.Members[i].ID != userID {
					other := s.Members[i]
					s.OtherUser = &other
				}
			}
		}

		if lmID != nil {
			s.LastMessage = &LastMessage{
				ID:        *lmID,
				AuthorID:  *lmAuthorID,
				Content:   *lmContent,
				CreatedAt: *lmCreatedAt,
			}
		}

		summaries = append(summaries, s)
	}

	return summaries, rows.Err()
}
