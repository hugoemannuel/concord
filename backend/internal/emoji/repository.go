package emoji

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/expression"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// uniqueViolation: código do Postgres para chave única repetida (o nome).
const uniqueViolation = "23505"

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// Create grava o emoji respeitando o limite do servidor: numa transação, um
// lock por servidor e depois o INSERT que só acontece se ainda há vaga (o
// INSERT vem depois do lock, então já conta os emojis de quem enviou junto).
func (r *Repository) Create(ctx context.Context, e *Emoji) error {
	return pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('server_emojis:' || $1, 0))`, e.ServerID); err != nil {
			return err
		}
		return insertError(tx.QueryRow(ctx, `
			INSERT INTO server_emojis (id, server_id, uploader_id, name, content_type, size_bytes)
			SELECT $1, $2, $3, $4, $5, $6
			WHERE (SELECT COUNT(*) FROM server_emojis WHERE server_id = $2) < $7
			RETURNING created_at`,
			e.ID, e.ServerID, e.UploaderID, e.Name, e.ContentType, e.SizeBytes, MaxEmojisPerServer,
		).Scan(&e.CreatedAt))
	})
}

// insertError: sem linha inserida = servidor cheio; índice único = nome repetido.
func insertError(err error) error {
	var pgErr *pgconn.PgError
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return ErrServerFull
	case errors.As(err, &pgErr) && pgErr.Code == uniqueViolation:
		return ErrNameTaken
	default:
		return err
	}
}

// ListForUser: numa consulta só, os emojis de todos os servidores de que a
// pessoa é membro, agrupados por servidor (servidores sem emoji ficam de fora).
func (r *Repository) ListForUser(ctx context.Context, userID string) ([]ServerEmojis, error) {
	if uuid.Validate(userID) != nil {
		return []ServerEmojis{}, nil
	}
	rows, err := r.db.Query(ctx, `
		SELECT s.id, s.name, s.icon_url,
		       e.id, e.uploader_id, e.name, e.content_type, e.size_bytes, e.created_at
		FROM server_members m
		JOIN servers s ON s.id = m.server_id
		JOIN server_emojis e ON e.server_id = m.server_id
		WHERE m.user_id = $1
		ORDER BY lower(s.name), s.id, e.created_at`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanGroups(rows)
}

// scanGroups: as linhas vêm ordenadas por servidor; cada uma vai para o grupo dele.
func scanGroups(rows pgx.Rows) ([]ServerEmojis, error) {
	return expression.ScanGroups(rows, func() (ServerEmojis, Emoji, error) {
		var g ServerEmojis
		var e Emoji
		err := rows.Scan(&g.ServerID, &g.ServerName, &g.ServerIconURL,
			&e.ID, &e.UploaderID, &e.Name, &e.ContentType, &e.SizeBytes, &e.CreatedAt)
		e.ServerID = g.ServerID
		return g, e, err
	}, byServer)
}

// byServer: os emojis de cada grupo, pelo servidor.
var byServer = expression.Grouping[ServerEmojis, Emoji]{
	Key:   func(g *ServerEmojis) string { return g.ServerID },
	Items: func(g *ServerEmojis) *[]Emoji { return &g.Emojis },
}

func (r *Repository) FindByID(ctx context.Context, id string) (*Emoji, error) {
	if uuid.Validate(id) != nil {
		return nil, ErrEmojiNotFound
	}
	var e Emoji
	err := r.db.QueryRow(ctx, `
		SELECT id, server_id, uploader_id, name, content_type, size_bytes, created_at, published_at
		FROM server_emojis WHERE id = $1`, id,
	).Scan(&e.ID, &e.ServerID, &e.UploaderID, &e.Name, &e.ContentType, &e.SizeBytes, &e.CreatedAt, &e.PublishedAt)
	if err != nil {
		return nil, notFound(err)
	}
	return &e, nil
}

// notFound troca o "nenhuma linha" do pgx pelo erro do domínio.
func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrEmojiNotFound
	}
	return err
}

func (r *Repository) CountByServer(ctx context.Context, serverID string) (int, error) {
	if uuid.Validate(serverID) != nil {
		return 0, nil
	}
	var count int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM server_emojis WHERE server_id = $1`, serverID).Scan(&count)
	return count, err
}

func (r *Repository) Delete(ctx context.Context, id string) error {
	if uuid.Validate(id) != nil {
		return ErrEmojiNotFound
	}
	tag, err := r.db.Exec(ctx, `DELETE FROM server_emojis WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrEmojiNotFound
	}
	return nil
}

// Update devolve os metadados persistidos; o arquivo e sua identidade permanecem iguais.
func (r *Repository) Update(ctx context.Context, serverID, id, name string) (*Emoji, error) {
	if uuid.Validate(id) != nil {
		return nil, ErrEmojiNotFound
	}
	var s Emoji
	err := r.db.QueryRow(ctx, `UPDATE server_emojis SET name=$3 WHERE server_id=$1 AND id=$2
 RETURNING id,server_id,uploader_id,name,content_type,size_bytes,created_at,published_at`, serverID, id, name).Scan(&s.ID, &s.ServerID, &s.UploaderID, &s.Name, &s.ContentType, &s.SizeBytes, &s.CreatedAt, &s.PublishedAt)
	if err != nil {
		return nil, insertError(notFound(err))
	}
	return &s, nil
}
