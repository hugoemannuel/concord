package message

import "context"

// CreateWithPoll grava a mensagem e a enquete dela numa transação só.
func (r *Repository) CreateWithPoll(ctx context.Context, msg *Message, poll *Poll) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(
		ctx,
		`
		INSERT INTO messages (id, author_id, channel_id, conversation_id, content, expires_at)
		VALUES ($1, $2, $3, $4, $5, `+expiresAtDaSalaSQL+`)
		`,
		msg.ID,
		msg.AuthorID,
		msg.ChannelID,
		msg.ConversationID,
		msg.Content,
	); err != nil {
		return err
	}

	if _, err := tx.Exec(
		ctx,
		`
		INSERT INTO polls (message_id, question, allow_multiselect, expires_at)
		VALUES ($1, $2, $3, $4)
		`,
		msg.ID,
		poll.Question,
		poll.AllowMultiselect,
		poll.ExpiresAt,
	); err != nil {
		return err
	}

	for _, a := range poll.Answers {
		if _, err := tx.Exec(
			ctx,
			`
			INSERT INTO poll_answers (message_id, answer_id, text, emoji, image_url)
			VALUES ($1, $2, $3, $4, $5)
			`,
			msg.ID,
			a.AnswerID,
			a.Text,
			a.Emoji,
			a.ImageURL,
		); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// FindPoll carrega a enquete de uma mensagem com as contagens atuais;
// "me_voted" é calculado para viewerID (vazio = ninguém).
func (r *Repository) FindPoll(ctx context.Context, messageID string, viewerID string) (*Poll, error) {
	polls, err := r.loadPolls(ctx, []string{messageID}, viewerID)
	if err != nil {
		return nil, err
	}
	poll, ok := polls[messageID]
	if !ok {
		return nil, ErrPollNotFound
	}
	return poll, nil
}

// HasPoll diz se a mensagem é uma enquete.
func (r *Repository) HasPoll(ctx context.Context, messageID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM polls WHERE message_id = $1)`, messageID).Scan(&exists)
	return exists, err
}

// AttachPolls preenche Poll nas mensagens que têm enquete.
func (r *Repository) AttachPolls(ctx context.Context, messages []Message, viewerID string) error {
	if len(messages) == 0 {
		return nil
	}
	ids := make([]string, len(messages))
	for i, m := range messages {
		ids[i] = m.ID
	}
	polls, err := r.loadPolls(ctx, ids, viewerID)
	if err != nil {
		return err
	}
	for i := range messages {
		messages[i].Poll = polls[messages[i].ID]
	}
	return nil
}

func (r *Repository) loadPolls(ctx context.Context, messageIDs []string, viewerID string) (map[string]*Poll, error) {
	polls := map[string]*Poll{}

	rows, err := r.db.Query(
		ctx,
		`
		SELECT
			p.message_id,
			p.question,
			p.allow_multiselect,
			p.expires_at,
			p.ended_at,
			(SELECT COUNT(DISTINCT v.user_id) FROM poll_votes v WHERE v.message_id = p.message_id)
		FROM polls p
		WHERE p.message_id = ANY($1::uuid[])
		`,
		messageIDs,
	)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id string
		poll := &Poll{Answers: []PollAnswer{}}
		if err := rows.Scan(
			&id,
			&poll.Question,
			&poll.AllowMultiselect,
			&poll.ExpiresAt,
			&poll.EndedAt,
			&poll.TotalVoters,
		); err != nil {
			rows.Close()
			return nil, err
		}
		polls[id] = poll
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(polls) == 0 {
		return polls, nil
	}

	rows, err = r.db.Query(
		ctx,
		`
		SELECT
			a.message_id,
			a.answer_id,
			a.text,
			a.emoji,
			a.image_url,
			COUNT(v.user_id),
			COALESCE(BOOL_OR(v.user_id::text = $2), FALSE)
		FROM poll_answers a
		LEFT JOIN poll_votes v ON v.message_id = a.message_id AND v.answer_id = a.answer_id
		WHERE a.message_id = ANY($1::uuid[])
		GROUP BY a.message_id, a.answer_id
		ORDER BY a.message_id, a.answer_id
		`,
		messageIDs,
		viewerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var a PollAnswer
		if err := rows.Scan(&id, &a.AnswerID, &a.Text, &a.Emoji, &a.ImageURL, &a.Count, &a.MeVoted); err != nil {
			return nil, err
		}
		if poll, ok := polls[id]; ok {
			poll.Answers = append(poll.Answers, a)
		}
	}
	return polls, rows.Err()
}

// SetVotes troca o voto de userID pelas respostas dadas (vazio remove o voto).
func (r *Repository) SetVotes(ctx context.Context, messageID string, userID string, answerIDs []int) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(
		ctx,
		`DELETE FROM poll_votes WHERE message_id = $1 AND user_id = $2`,
		messageID,
		userID,
	); err != nil {
		return err
	}

	for _, answerID := range answerIDs {
		if _, err := tx.Exec(
			ctx,
			`
			INSERT INTO poll_votes (message_id, answer_id, user_id)
			VALUES ($1, $2, $3)
			`,
			messageID,
			answerID,
			userID,
		); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// EndPoll encerra a enquete agora; sem efeito se ela já tinha sido encerrada.
func (r *Repository) EndPoll(ctx context.Context, messageID string) error {
	tag, err := r.db.Exec(
		ctx,
		`UPDATE polls SET ended_at = COALESCE(ended_at, NOW()) WHERE message_id = $1`,
		messageID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrPollNotFound
	}
	return nil
}
