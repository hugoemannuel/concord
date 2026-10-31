package event

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// ClaimDue reivindica os avisos que já venceram: marca sent_at e os devolve
// numa instrução só (UPDATE ... RETURNING). Quem já foi reivindicado não volta
// (idempotente) e, com várias instâncias, SKIP LOCKED evita pegar o mesmo aviso
// duas vezes. Avisos de evento cancelado não voltam.
func (r *Repository) ClaimDue(ctx context.Context, now time.Time, limit int) ([]DueReminder, error) {
	rows, err := r.db.Query(ctx, `
		UPDATE event_reminders r SET sent_at = $1
		FROM server_events e
		JOIN servers s ON s.id = e.server_id
		LEFT JOIN channels c ON c.id = e.voice_channel_id
		WHERE r.id IN (
		        SELECT id FROM event_reminders
		        WHERE sent_at IS NULL AND due_at <= $1
		        ORDER BY due_at LIMIT $2 FOR UPDATE SKIP LOCKED)
		  AND e.id = r.event_id AND e.canceled_at IS NULL
		RETURNING r.id, e.id, s.id, s.name, COALESCE(c.name, ''), e.title, r.occurrence_start, r.due_at, r.offset_minutes`,
		now, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]DueReminder, 0)
	for rows.Next() {
		var d DueReminder
		if err := rows.Scan(&d.ID, &d.EventID, &d.ServerID, &d.ServerName, &d.ChannelName, &d.Title,
			&d.Occurrence, &d.DueAt, &d.OffsetMinutes); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// Going: ids de quem disse "vou" na ocorrência.
func (r *Repository) Going(ctx context.Context, eventID string, occurrence time.Time) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT user_id FROM event_rsvps
		WHERE event_id = $1 AND occurrence_start = $2 AND going
		ORDER BY user_id`, eventID, occurrence)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// dueEvent é o que o avanço precisa de cada evento cuja ocorrência acabou.
type dueEvent struct {
	id      string
	starts  time.Time
	rule    Recurrence
	until   *time.Time
	count   *int
	done    int
	offsets []int
}

// AdvanceDue avança os eventos cuja ocorrência atual acabou (início + duração) e
// que já fecharam a sala: vai para a próxima ocorrência, com os avisos dela, ou
// encerra o evento se a recorrência acabou. Devolve quantos avançou.
func (r *Repository) AdvanceDue(ctx context.Context, now time.Time, loc *time.Location, limit int) (int, error) {
	advanced := 0
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		events, err := lockEnded(ctx, tx, now, limit)
		if err != nil {
			return err
		}
		for _, ev := range events {
			if err := advanceOne(ctx, tx, ev, now, loc); err != nil {
				return err
			}
		}
		advanced = len(events)
		return nil
	})
	return advanced, err
}

// lockEnded trava os eventos vivos, sem sala aberta, cuja ocorrência já acabou.
func lockEnded(ctx context.Context, tx pgx.Tx, now time.Time, limit int) ([]dueEvent, error) {
	rows, err := tx.Query(ctx, `
		SELECT id, starts_at, recurrence, recurrence_until, recurrence_count, occurrences_done, reminder_offsets
		FROM server_events
		WHERE canceled_at IS NULL AND finished_at IS NULL
		  AND voice_channel_id IS NULL AND text_channel_id IS NULL
		  AND next_start_at + duration_minutes * INTERVAL '1 minute' <= $1
		ORDER BY next_start_at LIMIT $2
		FOR UPDATE SKIP LOCKED`, now, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var events []dueEvent
	for rows.Next() {
		var ev dueEvent
		var rule string
		if err := rows.Scan(&ev.id, &ev.starts, &rule, &ev.until, &ev.count, &ev.done, &ev.offsets); err != nil {
			return nil, err
		}
		ev.rule = Recurrence(rule)
		events = append(events, ev)
	}
	return events, rows.Err()
}

// advanceOne passa um evento para a próxima ocorrência (ou o encerra).
func advanceOne(ctx context.Context, tx pgx.Tx, ev dueEvent, now time.Time, loc *time.Location) error {
	n := ev.done + 1
	if Finished(ev.rule, ev.until, ev.count, ev.starts, n, loc) {
		_, err := tx.Exec(ctx, `
			UPDATE server_events SET finished_at = $2, occurrences_done = $3, updated_at = NOW()
			WHERE id = $1`, ev.id, now, n)
		return err
	}
	next := OccurrenceAt(ev.starts, ev.rule, n, loc)
	if _, err := tx.Exec(ctx, `
		UPDATE server_events SET occurrences_done = $2, next_start_at = $3, updated_at = NOW()
		WHERE id = $1`, ev.id, n, next); err != nil {
		return err
	}
	return insertReminders(ctx, tx, ev.id, reminderRows(next, ev.offsets, now))
}
