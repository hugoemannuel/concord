package memberprofile

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository é o SQL de server_member_profiles.
type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

const storedColumns = `avatar_url, banner_url, banner_color, pronouns, bio, status_text, links, name_style, profile_theme, nameplate_mode, nameplate_url, avatar_decoration_url`

func scanStored(row pgx.Row, o *Overrides) error {
	return row.Scan(
		&o.AvatarURL, &o.BannerURL, &o.BannerColor, &o.Pronouns, &o.Bio, &o.StatusText,
		&o.Links, &o.NameStyle, &o.ProfileTheme, &o.NameplateMode, &o.NameplateCustomURL, &o.AvatarDecorationURL,
	)
}

// Find devolve o perfil com a faixa efetiva (zero = sem perfil).
func (r *Repository) Find(ctx context.Context, serverID, userID string) (Overrides, error) {
	var o Overrides
	err := r.db.QueryRow(ctx, `
		SELECT `+OverridesExpr("smp", "u")+`, smp.nameplate_url
		FROM server_member_profiles smp
		JOIN users u ON u.id = smp.user_id
		WHERE smp.server_id = $1 AND smp.user_id = $2`, serverID, userID).Scan(&o, &o.NameplateCustomURL)
	if errors.Is(err, pgx.ErrNoRows) {
		return Overrides{}, nil
	}
	return o, err
}

// Nickname: o apelido no servidor; ErrNotMember se a pessoa não está nele.
func (r *Repository) Nickname(ctx context.Context, serverID, userID string) (*string, error) {
	var nick *string
	err := r.db.QueryRow(ctx, `SELECT nickname FROM server_members WHERE server_id = $1 AND user_id = $2`, serverID, userID).Scan(&nick)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotMember
	}
	return nick, err
}

// GlobalNameplate: a imagem própria da faixa guardada no perfil global.
func (r *Repository) GlobalNameplate(ctx context.Context, userID string) (*string, error) {
	var url *string
	err := r.db.QueryRow(ctx, `SELECT nameplate_url FROM users WHERE id = $1`, userID).Scan(&url)
	return url, err
}

// Mutate lê o perfil travado, deixa change mudar e grava: numa transação, duas
// edições ao mesmo tempo não perdem campo. Sem nenhum campo sobrando, apaga a
// linha.
func (r *Repository) Mutate(ctx context.Context, serverID, userID string, change func(*Overrides) error) error {
	return pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		var o Overrides
		err := scanStored(tx.QueryRow(ctx, `SELECT `+storedColumns+` FROM server_member_profiles WHERE server_id = $1 AND user_id = $2 FOR UPDATE`, serverID, userID), &o)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if err := change(&o); err != nil {
			return err
		}
		if o.Empty() {
			_, err := tx.Exec(ctx, `DELETE FROM server_member_profiles WHERE server_id = $1 AND user_id = $2`, serverID, userID)
			return err
		}
		return upsert(ctx, tx, serverID, userID, o)
	})
}

func upsert(ctx context.Context, tx pgx.Tx, serverID, userID string, o Overrides) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO server_member_profiles (server_id, user_id, `+storedColumns+`)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		ON CONFLICT (server_id, user_id) DO UPDATE SET
			avatar_url = EXCLUDED.avatar_url,
			banner_url = EXCLUDED.banner_url,
			banner_color = EXCLUDED.banner_color,
			pronouns = EXCLUDED.pronouns,
			bio = EXCLUDED.bio,
			status_text = EXCLUDED.status_text,
			links = EXCLUDED.links,
			name_style = EXCLUDED.name_style,
			profile_theme = EXCLUDED.profile_theme,
			nameplate_mode = EXCLUDED.nameplate_mode,
			nameplate_url = EXCLUDED.nameplate_url,
			avatar_decoration_url = EXCLUDED.avatar_decoration_url,
			updated_at = NOW()`,
		serverID, userID, o.AvatarURL, o.BannerURL, o.BannerColor, o.Pronouns, o.Bio, o.StatusText,
		o.Links, o.NameStyle, o.ProfileTheme, o.NameplateMode, o.NameplateCustomURL, o.AvatarDecorationURL,
	)
	return memberOnly(err)
}

// memberOnly: a FK para server_members recusa quem não é (mais) membro.
func memberOnly(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23503" {
		return ErrNotMember
	}
	return err
}

// Delete apaga o perfil do servidor (o gatilho guarda as URLs para a limpeza).
func (r *Repository) Delete(ctx context.Context, serverID, userID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM server_member_profiles WHERE server_id = $1 AND user_id = $2`, serverID, userID)
	return err
}

// MediaInUse diz se algum perfil de servidor usa a URL (user.MediaKeeper).
func (r *Repository) MediaInUse(ctx context.Context, url string) (bool, error) {
	var used bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM server_member_profiles WHERE avatar_url = $1)
			OR EXISTS (SELECT 1 FROM server_member_profiles WHERE banner_url = $1)
			OR EXISTS (SELECT 1 FROM server_member_profiles WHERE nameplate_url = $1)
			OR EXISTS (SELECT 1 FROM server_member_profiles WHERE avatar_decoration_url = $1)`, url).Scan(&used)
	return used, err
}

// TakeTrash tira da caixa de saída as URLs de perfis que sumiram.
func (r *Repository) TakeTrash(ctx context.Context) ([]string, error) {
	rows, err := r.db.Query(ctx, `DELETE FROM server_member_profile_media_trash RETURNING url`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}
