package savedprofile

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/user"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// columns e scan andam juntos: a ordem das colunas é a do Scan.
const columns = `id, name, avatar_url, banner_url, fields, created_at, updated_at`

func scan(row pgx.Row) (*SavedProfile, error) {
	sp := &SavedProfile{}
	err := row.Scan(&sp.ID, &sp.Name, &sp.AvatarURL, &sp.BannerURL, &sp.Fields, &sp.CreatedAt, &sp.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return sp, nil
}

// List devolve os perfis salvos da pessoa, do mais antigo para o mais novo.
func (r *Repository) List(ctx context.Context, userID string) ([]SavedProfile, error) {
	rows, err := r.db.Query(ctx, `SELECT `+columns+` FROM saved_profiles WHERE user_id = $1 ORDER BY created_at, id`, userID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (SavedProfile, error) {
		sp, err := scan(row)
		if err != nil {
			return SavedProfile{}, err
		}
		return *sp, nil
	})
}

func (r *Repository) Find(ctx context.Context, userID, id string) (*SavedProfile, error) {
	return scan(r.db.QueryRow(ctx, `SELECT `+columns+` FROM saved_profiles WHERE id = $1 AND user_id = $2`, id, userID))
}

// Create salva respeitando o limite: a linha da pessoa fica travada enquanto
// conta, então dois "Salvar" ao mesmo tempo não passam de MaxPerUser.
func (r *Repository) Create(ctx context.Context, userID, name string, snap user.ProfileSnapshot) (*SavedProfile, error) {
	var sp *SavedProfile
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		if err := checkRoom(ctx, tx, userID); err != nil {
			return err
		}
		var err error
		sp, err = scan(tx.QueryRow(ctx, `
			INSERT INTO saved_profiles (user_id, name, avatar_url, banner_url, fields)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING `+columns, userID, name, snap.AvatarURL, snap.BannerURL, snap.Fields))
		return nameTaken(err)
	})
	return sp, err
}

// checkRoom trava a linha da pessoa e confere se cabe mais um perfil salvo.
func checkRoom(ctx context.Context, tx pgx.Tx, userID string) error {
	var count int
	err := tx.QueryRow(ctx, `
		SELECT (SELECT COUNT(*) FROM saved_profiles WHERE user_id = $1)
		FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&count)
	if err := userRowErr(err); err != nil {
		return err
	}
	if count >= MaxPerUser {
		return ErrLimit
	}
	return nil
}

// userRowErr: conta que não existe vira user.ErrUserNotFound.
func userRowErr(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return user.ErrUserNotFound
	}
	return err
}

func (r *Repository) Rename(ctx context.Context, userID, id, name string) (*SavedProfile, error) {
	sp, err := scan(r.db.QueryRow(ctx, `
		UPDATE saved_profiles SET name = $3, updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING `+columns, id, userID, name))
	return sp, nameTaken(err)
}

// Overwrite troca o snapshot (campos, avatar e banner) mantendo nome e
// posição. Devolve o perfil salvo novo e o anterior; a linha fica travada
// para a leitura do anterior e a troca serem uma coisa só.
func (r *Repository) Overwrite(ctx context.Context, userID, id string, snap user.ProfileSnapshot) (*SavedProfile, *SavedProfile, error) {
	var sp, old *SavedProfile
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		var err error
		old, err = scan(tx.QueryRow(ctx, `SELECT `+columns+` FROM saved_profiles WHERE id = $1 AND user_id = $2 FOR UPDATE`, id, userID))
		if err != nil {
			return err
		}
		sp, err = scan(tx.QueryRow(ctx, `
			UPDATE saved_profiles SET avatar_url = $3, banner_url = $4, fields = $5, updated_at = NOW()
			WHERE id = $1 AND user_id = $2
			RETURNING `+columns, id, userID, snap.AvatarURL, snap.BannerURL, snap.Fields))
		return err
	})
	if err != nil {
		return nil, nil, err
	}
	return sp, old, nil
}

// Delete apaga e devolve o que foi apagado.
func (r *Repository) Delete(ctx context.Context, userID, id string) (*SavedProfile, error) {
	return scan(r.db.QueryRow(ctx, `DELETE FROM saved_profiles WHERE id = $1 AND user_id = $2 RETURNING `+columns, id, userID))
}

// MediaInUse diz se a URL de avatar/banner ainda é usada por algum perfil ou
// perfil salvo (user.MediaKeeper).
func (r *Repository) MediaInUse(ctx context.Context, url string) (bool, error) {
	var used bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM saved_profiles WHERE avatar_url = $1)
			OR EXISTS (SELECT 1 FROM saved_profiles WHERE banner_url = $1)
			OR EXISTS (SELECT 1 FROM users WHERE avatar_url = $1 OR banner_url = $1)`, url).Scan(&used)
	return used, err
}

// nameTaken traduz a violação do índice único de nome.
func nameTaken(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ErrNameTaken
	}
	return err
}
