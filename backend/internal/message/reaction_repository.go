package message

import (
	"context"
	"fmt"
	"slices"

	"github.com/jackc/pgx/v5"
)

// Reações: pôr, tirar e agrupar por mensagem (emoji, quantos, quem).

// AddReaction põe a reação; uma 21ª reação diferente volta ErrTooManyReactions
// (MaxDistinctReactions). A linha da mensagem fica travada na transação para
// duas reações novas ao mesmo tempo não passarem juntas do limite.
func (r *Repository) AddReaction(ctx context.Context, messageID string, userID string, emoji string) (bool, error) {
	var added bool
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		var err error
		added, err = addReactionTx(ctx, tx, messageID, userID, emoji)
		return err
	})
	return added, err
}

func addReactionTx(ctx context.Context, tx pgx.Tx, messageID string, userID string, emoji string) (bool, error) {
	distinct, present, err := lockedReactionCount(ctx, tx, messageID, emoji)
	if err != nil {
		return false, err
	}
	if !canAddReaction(distinct, present) {
		return false, ErrTooManyReactions
	}
	return insertReaction(ctx, tx, messageID, userID, emoji)
}

// lockedReactionCount trava a mensagem e conta os emojis distintos dela, e se
// `emoji` já é um deles.
func lockedReactionCount(ctx context.Context, tx pgx.Tx, messageID string, emoji string) (int, bool, error) {
	if _, err := tx.Exec(ctx, `SELECT 1 FROM messages WHERE id = $1 FOR UPDATE`, messageID); err != nil {
		return 0, false, fmt.Errorf("travar mensagem: %w", err)
	}
	var distinct int
	var present bool
	err := tx.QueryRow(ctx, `
		SELECT COUNT(DISTINCT emoji), COALESCE(BOOL_OR(emoji = $2), FALSE)
		FROM message_reactions
		WHERE message_id = $1
	`, messageID, emoji).Scan(&distinct, &present)
	return distinct, present, err
}

func insertReaction(ctx context.Context, tx pgx.Tx, messageID string, userID string, emoji string) (bool, error) {
	tag, err := tx.Exec(
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

// HasReaction: alguém já reagiu com este emoji nesta mensagem?
func (r *Repository) HasReaction(ctx context.Context, messageID string, emoji string) (bool, error) {
	var present bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM message_reactions WHERE message_id = $1 AND emoji = $2)`,
		messageID, emoji,
	).Scan(&present)
	return present, err
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
