package proposal

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

const selectComment = `
	SELECT c.id, c.proposal_id, c.author_id, u.display_name, u.avatar_url,
		c.body, c.created_at, c.edited_at,
		COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.user_id, 'username', mu.username,
			'display_name', mu.display_name) ORDER BY mu.username)
			FROM proposal_comment_mentions m JOIN users mu ON mu.id = m.user_id
			WHERE m.comment_id = c.id), '[]'::jsonb),
		c.reply_to_id,
		(SELECT jsonb_build_object('id', rc.id, 'author_id', rc.author_id,
			'author_name', ru.display_name, 'body', left(rc.body, 120))
			FROM proposal_comments rc JOIN users ru ON ru.id = rc.author_id
			WHERE rc.id = c.reply_to_id),
		COALESCE((SELECT jsonb_agg(jsonb_build_object('emoji', g.emoji, 'count', g.cnt,
			'user_ids', g.uids) ORDER BY g.first_at, g.emoji)
			FROM (SELECT emoji, COUNT(*)::int AS cnt, jsonb_agg(user_id ORDER BY created_at) AS uids,
				MIN(created_at) AS first_at
				FROM proposal_comment_reactions WHERE comment_id = c.id GROUP BY emoji) g), '[]'::jsonb),
		COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind,
			'content_type', a.content_type, 'filename', a.filename, 'size_bytes', a.size_bytes,
			'width', a.width, 'height', a.height, 'duration_ms', a.duration_ms)
			ORDER BY a.position, a.created_at)
			FROM proposal_comment_attachments a WHERE a.comment_id = c.id), '[]'::jsonb)
	FROM proposal_comments c
	JOIN users u ON u.id = c.author_id
`

func scanComment(row pgx.Row) (Comment, error) {
	var c Comment
	var mentions, reply, reactions, attachments []byte
	if err := row.Scan(&c.ID, &c.ProposalID, &c.AuthorID, &c.AuthorName, &c.AuthorAvatarURL,
		&c.Body, &c.CreatedAt, &c.EditedAt, &mentions, &c.ReplyToID, &reply, &reactions, &attachments); err != nil {
		return c, err
	}
	c.Mentions = []Mention{}
	c.Reactions = []ReactionSummary{}
	c.Attachments = []CommentAttachment{}
	if err := json.Unmarshal(mentions, &c.Mentions); err != nil {
		return c, err
	}
	if len(reply) > 0 && string(reply) != "null" {
		c.ReplyTo = &CommentReply{}
		if err := json.Unmarshal(reply, c.ReplyTo); err != nil {
			return c, err
		}
	}
	if err := json.Unmarshal(reactions, &c.Reactions); err != nil {
		return c, err
	}
	if err := json.Unmarshal(attachments, &c.Attachments); err != nil {
		return c, err
	}
	for i := range c.Attachments {
		c.Attachments[i].URL = commentMediaURL(c.Attachments[i].ID)
	}
	return c, nil
}

func (r *Repository) ListComments(ctx context.Context, proposalID string) ([]Comment, error) {
	rows, err := r.db.Query(ctx, selectComment+`WHERE c.proposal_id = $1 ORDER BY c.created_at, c.id LIMIT 500`, proposalID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Comment{}
	for rows.Next() {
		c, err := scanComment(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, rows.Err()
}

func (r *Repository) GetComment(ctx context.Context, id string) (*Comment, error) {
	c, err := scanComment(r.db.QueryRow(ctx, selectComment+`WHERE c.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrCommentNotFound
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// CreateComment grava o comentário, as menções (já validadas), a resposta e os
// anexos juntos. A resposta tem de ser de um comentário da mesma proposta e cada
// anexo, um pendente de quem comenta; senão devolve ErrInvalidReply/ErrInvalidAttachment
// e nada é gravado.
func (r *Repository) CreateComment(ctx context.Context, proposalID, authorID, body string, mentionIDs []string, replyToID *string, attachmentIDs []string) (string, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	if replyToID != nil {
		var ok bool
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM proposal_comments WHERE id = $1 AND proposal_id = $2)`,
			*replyToID, proposalID).Scan(&ok); err != nil {
			return "", err
		}
		if !ok {
			return "", ErrInvalidReply
		}
	}

	var id string
	if err := tx.QueryRow(ctx, `
		INSERT INTO proposal_comments (proposal_id, author_id, body, reply_to_id) VALUES ($1, $2, $3, $4)
		RETURNING id`,
		proposalID, authorID, body, replyToID).Scan(&id); err != nil {
		return "", err
	}
	for _, uid := range mentionIDs {
		if _, err := tx.Exec(ctx, `
			INSERT INTO proposal_comment_mentions (comment_id, user_id) VALUES ($1, $2)
			ON CONFLICT DO NOTHING`, id, uid); err != nil {
			return "", err
		}
	}
	for pos, attID := range attachmentIDs {
		tag, err := tx.Exec(ctx, `
			UPDATE proposal_comment_attachments SET comment_id = $1, position = $3
			WHERE id = $2 AND comment_id IS NULL AND uploader_id = $4`,
			id, attID, pos, authorID)
		if err != nil {
			return "", err
		}
		if tag.RowsAffected() == 0 {
			return "", ErrInvalidAttachment
		}
	}
	return id, tx.Commit(ctx)
}

func (r *Repository) UpdateComment(ctx context.Context, id, body string) error {
	tag, err := r.db.Exec(ctx, `UPDATE proposal_comments SET body = $2, edited_at = NOW() WHERE id = $1`, id, body)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrCommentNotFound
	}
	return nil
}

func (r *Repository) DeleteComment(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM proposal_comments WHERE id = $1`, id)
	return err
}

// CountRecentComments conta os comentários da pessoa desde since (limite de spam).
func (r *Repository) CountRecentComments(ctx context.Context, authorID string, since time.Time) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM proposal_comments WHERE author_id = $1 AND created_at > $2`,
		authorID, since).Scan(&n)
	return n, err
}

// --- menções ---

// MentionableUsers devolve, entre ids, quem existe e pode ser marcado por
// authorID: nem ele mesmo, nem quem bloqueou ele ou foi bloqueado por ele.
func (r *Repository) MentionableUsers(ctx context.Context, authorID string, ids []string) ([]string, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	rows, err := r.db.Query(ctx, `
		SELECT u.id FROM users u
		WHERE u.id = ANY($1::uuid[]) AND u.id <> $2
		  AND NOT EXISTS (
			SELECT 1 FROM user_blocks b
			WHERE (b.blocker_id = $2 AND b.blocked_id = u.id)
			   OR (b.blocker_id = u.id AND b.blocked_id = $2))`, ids, authorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// UnseenMentions lista as menções que userID ainda não viu, da mais nova.
func (r *Repository) UnseenMentions(ctx context.Context, userID string) ([]PendingMention, error) {
	rows, err := r.db.Query(ctx, `
		SELECT c.proposal_id, c.id, p.title, u.display_name, c.body, c.created_at
		FROM proposal_comment_mentions m
		JOIN proposal_comments c ON c.id = m.comment_id
		JOIN proposals p ON p.id = c.proposal_id
		JOIN users u ON u.id = c.author_id
		WHERE m.user_id = $1 AND m.seen_at IS NULL
		ORDER BY c.created_at DESC
		LIMIT 100`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []PendingMention{}
	for rows.Next() {
		var m PendingMention
		if err := rows.Scan(&m.ProposalID, &m.CommentID, &m.ProposalTitle, &m.AuthorName, &m.Snippet, &m.CreatedAt); err != nil {
			return nil, err
		}
		m.Snippet = snippet(m.Snippet)
		list = append(list, m)
	}
	return list, rows.Err()
}

// MarkMentionsSeen marca como vistas as menções de userID: as de uma proposta
// ou, com proposalID nulo, todas.
func (r *Repository) MarkMentionsSeen(ctx context.Context, userID string, proposalID *string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE proposal_comment_mentions m SET seen_at = NOW()
		FROM proposal_comments c
		WHERE c.id = m.comment_id AND m.user_id = $1 AND m.seen_at IS NULL
		  AND ($2::uuid IS NULL OR c.proposal_id = $2::uuid)`, userID, proposalID)
	return err
}
