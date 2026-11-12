package message

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

var (
	ErrPinLimitReached = errors.New("pin limit reached (maximum 50 pinned messages per channel)")
)

const MaxPinnedMessagesPerChannel = 50

var pinnedMessageColumns = messageColumns + `,
	cpm.pinned_at,
	cpm.pinned_by,
	pu.username,
	pu.display_name,
	pu.avatar_url
`

const pinnedMessageFrom = `
	FROM channel_pinned_messages cpm
	JOIN messages m ON m.id = cpm.message_id
	JOIN users u ON u.id = m.author_id
	LEFT JOIN messages rm ON rm.id = m.reply_to_id
	LEFT JOIN users ru ON ru.id = rm.author_id
	LEFT JOIN server_stickers stk ON stk.id = m.sticker_id
	LEFT JOIN users pu ON pu.id = cpm.pinned_by
` + messageProfileJoins

func (r *Repository) CountChannelPins(ctx context.Context, channelID string) (int, error) {
	var count int
	err := r.db.QueryRow(
		ctx,
		`SELECT COUNT(*) FROM channel_pinned_messages WHERE channel_id = $1`,
		channelID,
	).Scan(&count)
	return count, err
}

func (r *Repository) PinMessage(ctx context.Context, channelID, messageID, userID string) (*PinnedMessage, error) {
	// Verifica se já está fixada
	var alreadyPinned bool
	err := r.db.QueryRow(
		ctx,
		`SELECT EXISTS(SELECT 1 FROM channel_pinned_messages WHERE channel_id = $1 AND message_id = $2)`,
		channelID,
		messageID,
	).Scan(&alreadyPinned)
	if err != nil {
		return nil, err
	}

	if !alreadyPinned {
		count, err := r.CountChannelPins(ctx, channelID)
		if err != nil {
			return nil, err
		}
		if count >= MaxPinnedMessagesPerChannel {
			return nil, ErrPinLimitReached
		}
	}

	now := time.Now()
	_, err = r.db.Exec(
		ctx,
		`INSERT INTO channel_pinned_messages (channel_id, message_id, pinned_by, pinned_at)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (channel_id, message_id) DO UPDATE SET pinned_at = EXCLUDED.pinned_at`,
		channelID,
		messageID,
		userID,
		now,
	)
	if err != nil {
		return nil, err
	}

	return r.GetPinnedMessage(ctx, channelID, messageID)
}

func (r *Repository) UnpinMessage(ctx context.Context, channelID, messageID string) error {
	tag, err := r.db.Exec(
		ctx,
		`DELETE FROM channel_pinned_messages WHERE channel_id = $1 AND message_id = $2`,
		channelID,
		messageID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrMessageNotFound
	}
	return nil
}

func (r *Repository) GetPinnedMessage(ctx context.Context, channelID, messageID string) (*PinnedMessage, error) {
	row := r.db.QueryRow(
		ctx,
		`SELECT `+pinnedMessageColumns+`
		 `+pinnedMessageFrom+`
		 WHERE cpm.channel_id = $1 AND cpm.message_id = $2 AND `+notExpired+``,
		channelID,
		messageID,
	)

	pins, err := scanPinnedRows(row)
	if err != nil {
		return nil, err
	}
	if len(pins) == 0 {
		return nil, ErrMessageNotFound
	}

	if err := r.enrichPins(ctx, pins); err != nil {
		return nil, err
	}

	return &pins[0], nil
}

func (r *Repository) ListPinnedMessages(ctx context.Context, channelID string) ([]PinnedMessage, error) {
	rows, err := r.db.Query(
		ctx,
		`SELECT `+pinnedMessageColumns+`
		 `+pinnedMessageFrom+`
		 WHERE cpm.channel_id = $1 AND `+notExpired+`
		 ORDER BY cpm.pinned_at DESC`,
		channelID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	pins, err := scanPinnedRows(rows)
	if err != nil {
		return nil, err
	}

	if err := r.enrichPins(ctx, pins); err != nil {
		return nil, err
	}

	return pins, nil
}

func (r *Repository) enrichPins(ctx context.Context, pins []PinnedMessage) error {
	if len(pins) == 0 {
		return nil
	}
	msgs := make([]Message, len(pins))
	for i := range pins {
		msgs[i] = pins[i].Message
	}

	if err := r.attachReactions(ctx, msgs); err != nil {
		return err
	}
	if err := r.AttachAttachments(ctx, msgs); err != nil {
		return err
	}

	for i := range pins {
		pins[i].Reactions = msgs[i].Reactions
		pins[i].Attachments = msgs[i].Attachments
	}
	return nil
}

type singleOrMultiRow interface {
	Scan(dest ...interface{}) error
}

func scanPinnedRows(source interface{}) ([]PinnedMessage, error) {
	var pins []PinnedMessage

	scanOne := func(s singleOrMultiRow) (*PinnedMessage, error) {
		var pin PinnedMessage
		var pinnedByID, pinnedByUsername, pinnedByDisplayName, pinnedByAvatarURL *string

		msg, err := scanMessageRow(
			s,
			&pin.PinnedAt,
			&pinnedByID,
			&pinnedByUsername,
			&pinnedByDisplayName,
			&pinnedByAvatarURL,
		)
		if err != nil {
			return nil, err
		}
		pin.Message = msg
		pin.Message.PinnedAt = &pin.PinnedAt

		if pinnedByID != nil {
			pin.PinnedByID = pinnedByID
			pin.PinnedBy = &Author{
				ID: *pinnedByID,
			}
			if pinnedByUsername != nil {
				pin.PinnedBy.Username = *pinnedByUsername
			}
			if pinnedByDisplayName != nil {
				pin.PinnedBy.DisplayName = *pinnedByDisplayName
			}
			pin.PinnedBy.AvatarURL = pinnedByAvatarURL
		}

		return &pin, nil
	}

	switch v := source.(type) {
	case pgx.Rows:
		for v.Next() {
			p, err := scanOne(v)
			if err != nil {
				return nil, err
			}
			pins = append(pins, *p)
		}
		if err := v.Err(); err != nil {
			return nil, err
		}
	case pgx.Row:
		p, err := scanOne(v)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, nil
			}
			return nil, err
		}
		pins = append(pins, *p)
	}

	if pins == nil {
		pins = []PinnedMessage{}
	}
	return pins, nil
}
