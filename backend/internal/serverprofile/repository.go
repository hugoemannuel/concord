package serverprofile

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository: o SQL do perfil, das tags (repository_tags.go) e dos jogos
// (repository_games.go).
type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

const profileColumns = `banner_preset, banner_image, traits, description, games, private,
	strip_preset, strip_image, theme_starter, theme_image, theme_dim, tag_name, tag_badge, tag_color`

// defaultProfile: o perfil de um servidor que nunca foi customizado.
func defaultProfile() Profile {
	return Profile{Traits: []Trait{}, Games: []Game{}, Theme: Theme{Dim: DefaultThemeDim}}
}

// scanProfile lê as profileColumns; a tag só existe com nome.
func scanProfile(row pgx.Row, serverID string) (Profile, error) {
	p := defaultProfile()
	var tag Tag
	err := row.Scan(
		&p.Banner.Preset, &p.Banner.Image, &p.Traits, &p.Description, &p.Games, &p.Private,
		&p.Strip.Preset, &p.Strip.Image, &p.Theme.Starter, &p.Theme.Image, &p.Theme.Dim,
		&tag.Name, &tag.Badge, &tag.Color,
	)
	if err != nil {
		return p, err
	}
	if tag.Name != "" {
		tag.ServerID = serverID
		p.Tag = &tag
	}
	return p, nil
}

// Profile: sem linha, o padrão.
func (r *Repository) Profile(ctx context.Context, serverID string) (Profile, error) {
	p, err := scanProfile(r.db.QueryRow(ctx, `SELECT `+profileColumns+` FROM server_profiles WHERE server_id = $1`, serverID), serverID)
	if errors.Is(err, pgx.ErrNoRows) {
		return defaultProfile(), nil
	}
	return p, err
}

// ServerFacts: nil se o servidor não existe.
func (r *Repository) ServerFacts(ctx context.Context, serverID string) (*Facts, error) {
	f := &Facts{}
	err := r.db.QueryRow(ctx, `
		SELECT s.name, NULLIF(s.icon_url, ''), s.created_at,
			COALESCE((SELECT array_agg(m.user_id::text) FROM server_members m WHERE m.server_id = s.id), '{}')
		FROM servers s WHERE s.id = $1`, serverID,
	).Scan(&f.Name, &f.IconURL, &f.CreatedAt, &f.MemberIDs)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return f, nil
}

// CanSeePrivate: é membro ou tem um convite pendente. Sem login, nenhum dos dois.
func (r *Repository) CanSeePrivate(ctx context.Context, serverID, userID string) (member, invited bool, err error) {
	if userID == "" {
		return false, false, nil
	}
	err = r.db.QueryRow(ctx, `
		SELECT
			EXISTS (SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2),
			EXISTS (SELECT 1 FROM server_invites WHERE server_id = $1 AND invitee_id = $2 AND status = 'pending')`,
		serverID, userID,
	).Scan(&member, &invited)
	return member, invited, err
}

// Edit roda edit numa transação com a linha travada: duas edições ao mesmo tempo
// não se desfazem, e trocar o nome da tag tira a tag dos membros junto.
func (r *Repository) Edit(ctx context.Context, serverID string, edit EditFunc) (before, after Profile, err error) {
	err = pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO server_profiles (server_id) VALUES ($1) ON CONFLICT (server_id) DO NOTHING`, serverID); err != nil {
			return err
		}
		current, err := scanProfile(tx.QueryRow(ctx, `SELECT `+profileColumns+` FROM server_profiles WHERE server_id = $1 FOR UPDATE`, serverID), serverID)
		if err != nil {
			return err
		}
		next, resetTag, err := edit(current)
		if err != nil {
			return err
		}
		if err := saveProfile(ctx, tx, serverID, next); err != nil {
			return err
		}
		if resetTag {
			if _, err := tx.Exec(ctx, `DELETE FROM user_server_tags WHERE server_id = $1`, serverID); err != nil {
				return err
			}
		}
		before, after = current, next
		return nil
	})
	return before, after, err
}

func saveProfile(ctx context.Context, tx pgx.Tx, serverID string, p Profile) error {
	name, badge, color := tagFields(p.Tag)
	_, err := tx.Exec(ctx, `
		UPDATE server_profiles SET
			banner_preset = $2, banner_image = $3, traits = $4, description = $5, games = $6, private = $7,
			strip_preset = $8, strip_image = $9, theme_starter = $10, theme_image = $11, theme_dim = $12,
			tag_name = $13, tag_badge = $14, tag_color = $15, updated_at = NOW()
		WHERE server_id = $1`,
		serverID, p.Banner.Preset, p.Banner.Image, p.Traits, p.Description, p.Games, p.Private,
		p.Strip.Preset, p.Strip.Image, p.Theme.Starter, p.Theme.Image, p.Theme.Dim, name, badge, color,
	)
	return err
}

// ImagesInUse: as URLs de imagem de todos os perfis (a faxina não apaga estas).
func (r *Repository) ImagesInUse(ctx context.Context) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT image FROM (
			SELECT banner_image AS image FROM server_profiles
			UNION SELECT strip_image FROM server_profiles
			UNION SELECT theme_image FROM server_profiles
		) used WHERE image <> ''`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}
