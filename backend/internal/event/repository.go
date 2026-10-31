package event

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// ReminderRow é um aviso a agendar (uma linha de event_reminders).
type ReminderRow struct {
	Occurrence    time.Time
	OffsetMinutes int
	DueAt         time.Time
}

// reminderRows monta os avisos de uma ocorrência. O "na hora" (0) sempre
// entra; os de antecedência que já passaram (evento criado em cima da hora)
// ficam de fora.
func reminderRows(occurrence time.Time, offsets []int, now time.Time) []ReminderRow {
	rows := make([]ReminderRow, 0, len(offsets)+1)
	for _, m := range append(slices.Clone(offsets), 0) {
		due := occurrence.Add(-time.Duration(m) * time.Minute)
		if m > 0 && due.Before(now) {
			continue
		}
		rows = append(rows, ReminderRow{Occurrence: occurrence, OffsetMinutes: m, DueAt: due})
	}
	return rows
}

// eventSelect lê o evento com a contagem de "vou" e a resposta de quem pede
// ($2) na ocorrência atual. O filtro (WHERE) vem de quem usa.
const eventSelect = `
	SELECT e.id, e.server_id, e.scope, e.title, e.description, e.banner_id,
	       e.starts_at, e.next_start_at, e.duration_minutes, e.game_name, e.voice_channel_id, e.text_channel_id, e.recurrence, e.recurrence_until, e.recurrence_count,
	       e.occurrences_done, e.reminder_offsets, e.created_by, e.canceled_at, e.finished_at, e.created_at,
	       COALESCE((SELECT COUNT(*) FROM event_rsvps r
	                 WHERE r.event_id = e.id AND r.occurrence_start = e.next_start_at AND r.going), 0),
	       (SELECT r.going FROM event_rsvps r
	        WHERE r.event_id = e.id AND r.occurrence_start = e.next_start_at AND r.user_id = $2)
	FROM server_events e`

func scanEvent(row pgx.Row) (Event, error) {
	var e Event
	var rule string
	err := row.Scan(&e.ID, &e.ServerID, &e.Scope, &e.Title, &e.Description, &e.BannerID,
		&e.StartsAt, &e.NextStartAt, &e.DurationMinutes, &e.GameName, &e.VoiceChannelID, &e.TextChannelID, &rule, &e.RecurrenceUntil, &e.RecurrenceCount,
		&e.OccurrencesDone, &e.ReminderOffsets, &e.CreatedBy, &e.CanceledAt, &e.FinishedAt, &e.CreatedAt,
		&e.GoingCount, &e.MyRSVP)
	e.Recurrence = Recurrence(rule)
	return e, err
}

// Create grava o evento e os avisos da primeira ocorrência na mesma transação.
func (r *Repository) Create(ctx context.Context, e *Event, reminders []ReminderRow) error {
	return pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `
			INSERT INTO server_events (id, server_id, scope, title, description, banner_id,
				starts_at, next_start_at, duration_minutes, game_name, recurrence, recurrence_until, recurrence_count,
				occurrences_done, reminder_offsets, created_by)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
			RETURNING created_at`,
			e.ID, e.ServerID, e.Scope, e.Title, e.Description, e.BannerID,
			e.StartsAt, e.NextStartAt, e.DurationMinutes, e.GameName, string(e.Recurrence), e.RecurrenceUntil, e.RecurrenceCount,
			e.OccurrencesDone, e.ReminderOffsets, e.CreatedBy,
		).Scan(&e.CreatedAt)
		if err != nil {
			return err
		}
		return insertReminders(ctx, tx, e.ID, reminders)
	})
}

// Update troca os campos do evento vivo e refaz os avisos pendentes (os já
// enviados ficam como estão) na mesma transação.
func (r *Repository) Update(ctx context.Context, e *Event, reminders []ReminderRow) error {
	return pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			UPDATE server_events SET title = $3, description = $4, banner_id = $5,
				starts_at = $6, next_start_at = $7, duration_minutes = $8, game_name = $9, recurrence = $10, recurrence_until = $11,
				recurrence_count = $12, occurrences_done = $13, reminder_offsets = $14, updated_at = NOW()
			WHERE id = $1 AND server_id = $2 AND canceled_at IS NULL AND finished_at IS NULL`,
			e.ID, e.ServerID, e.Title, e.Description, e.BannerID,
			e.StartsAt, e.NextStartAt, e.DurationMinutes, e.GameName, string(e.Recurrence), e.RecurrenceUntil,
			e.RecurrenceCount, e.OccurrencesDone, e.ReminderOffsets)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrEventNotFound
		}
		if err := deletePendingReminders(ctx, tx, e.ID); err != nil {
			return err
		}
		return insertReminders(ctx, tx, e.ID, reminders)
	})
}

// Cancel marca o evento como cancelado e apaga os avisos que ainda não saíram.
func (r *Repository) Cancel(ctx context.Context, serverID, eventID string) error {
	if uuid.Validate(eventID) != nil || uuid.Validate(serverID) != nil {
		return ErrEventNotFound
	}
	return pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			UPDATE server_events SET canceled_at = NOW(), updated_at = NOW()
			WHERE id = $1 AND server_id = $2 AND canceled_at IS NULL`, eventID, serverID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrEventNotFound
		}
		return deletePendingReminders(ctx, tx, eventID)
	})
}

// Find devolve o evento do servidor (inclusive cancelado ou encerrado; quem
// chama decide o que fazer com eles).
func (r *Repository) Find(ctx context.Context, serverID, eventID string) (*Event, error) {
	if uuid.Validate(eventID) != nil || uuid.Validate(serverID) != nil {
		return nil, ErrEventNotFound
	}
	e, err := scanEvent(r.db.QueryRow(ctx, eventSelect+` WHERE e.id = $1 AND e.server_id = $3`, eventID, nil, serverID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrEventNotFound
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}

// ListUpcoming: os eventos vivos do servidor, do mais próximo ao mais distante.
func (r *Repository) ListUpcoming(ctx context.Context, serverID, userID string) ([]Event, error) {
	if uuid.Validate(serverID) != nil {
		return []Event{}, nil
	}
	rows, err := r.db.Query(ctx, eventSelect+`
		WHERE e.server_id = $1 AND e.canceled_at IS NULL AND e.finished_at IS NULL
		ORDER BY e.next_start_at, e.id`, serverID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := make([]Event, 0)
	for rows.Next() {
		e, err := scanEvent(rows)
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

func insertReminders(ctx context.Context, tx pgx.Tx, eventID string, rows []ReminderRow) error {
	for _, row := range rows {
		if _, err := tx.Exec(ctx, `
			INSERT INTO event_reminders (event_id, occurrence_start, offset_minutes, due_at)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (event_id, occurrence_start, offset_minutes) DO NOTHING`,
			eventID, row.Occurrence, row.OffsetMinutes, row.DueAt); err != nil {
			return err
		}
	}
	return nil
}

func deletePendingReminders(ctx context.Context, tx pgx.Tx, eventID string) error {
	_, err := tx.Exec(ctx, `DELETE FROM event_reminders WHERE event_id = $1 AND sent_at IS NULL`, eventID)
	return err
}

// ServerOfBanner diz de qual servidor é o evento que usa o banner.
func (r *Repository) ServerOfBanner(ctx context.Context, bannerID string) (string, error) {
	if uuid.Validate(bannerID) != nil {
		return "", ErrEventNotFound
	}
	var serverID string
	err := r.db.QueryRow(ctx, `SELECT server_id FROM server_events WHERE banner_id = $1 LIMIT 1`, bannerID).Scan(&serverID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrEventNotFound
	}
	return serverID, err
}

// UpdateBasics troca só título, descrição e banner do evento vivo (a edição de
// um evento em andamento): horário, sala e avisos não mudam.
func (r *Repository) UpdateBasics(ctx context.Context, e *Event) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE server_events SET title = $3, description = $4, banner_id = $5, updated_at = NOW()
		WHERE id = $1 AND server_id = $2 AND canceled_at IS NULL AND finished_at IS NULL`,
		e.ID, e.ServerID, e.Title, e.Description, e.BannerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrEventNotFound
	}
	return nil
}

// LiveBannerIDs: os arquivos de banner de eventos vivos (nem cancelados nem
// encerrados). O resto, passado o prazo, é lixo e a faxina apaga.
func (r *Repository) LiveBannerIDs(ctx context.Context) (map[string]bool, error) {
	rows, err := r.db.Query(ctx, `
		SELECT banner_id FROM server_events
		WHERE banner_id IS NOT NULL AND canceled_at IS NULL AND finished_at IS NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	live := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		live[id] = true
	}
	return live, rows.Err()
}
