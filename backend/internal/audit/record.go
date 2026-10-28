package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Diff acrescenta a mudança de field quando antes e depois são diferentes.
func Diff(changes []Change, field string, before, after any) []Change {
	if reflect.DeepEqual(before, after) {
		return changes
	}
	return append(changes, Change{Field: field, Before: before, After: after})
}

type execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

type beginner interface {
	Begin(ctx context.Context) (pgx.Tx, error)
}

// Tx roda fn numa transação. fn devolve o registro a gravar (nil = nenhum),
// que entra na mesma transação da alteração: ou os dois ficam, ou nenhum.
func Tx(ctx context.Context, db beginner, fn func(tx pgx.Tx) (*Event, error)) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	event, err := fn(tx)
	if err != nil {
		return err
	}
	if event != nil {
		if err := Write(ctx, tx, *event); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// Write grava o registro. Dentro de uma transação, passa o tx.
func Write(ctx context.Context, db execer, e Event) error {
	var changes any
	if len(e.Changes) > 0 {
		raw, err := json.Marshal(e.Changes)
		if err != nil {
			return fmt.Errorf("registro de auditoria: %w", err)
		}
		changes = string(raw)
	}
	result := e.Result
	if result == "" {
		result = ResultOK
	}
	_, err := db.Exec(
		ctx,
		`
		INSERT INTO server_audit_logs (server_id, actor_id, action, target_type, target_id, target_name, changes, result, reason, created_at)
		VALUES ($1, NULLIF($2, '')::uuid, $3, $4, $5, $6, $7::jsonb, $8, NULLIF($9, ''), clock_timestamp())
		`,
		e.ServerID, e.ActorID, string(e.Action), e.TargetType, e.TargetID, e.TargetName, changes, result, e.Reason,
	)
	if err != nil {
		return fmt.Errorf("registro de auditoria: %w", err)
	}
	return nil
}

// Recorder grava registros fora de transação. Só a voz usa: a ação já
// aconteceu quando o registro é gravado (não há o que desfazer).
type Recorder struct {
	db execer
}

func NewRecorder(db *pgxpool.Pool) *Recorder {
	return &Recorder{db: db}
}

func (r *Recorder) Record(ctx context.Context, e Event) error {
	return Write(ctx, r.db, e)
}
