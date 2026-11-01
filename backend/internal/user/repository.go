package user

import (
	"context"
	"fmt"
	"strings"

	"gin-quickstart/backend/internal/cosmetics"
	"gin-quickstart/backend/internal/profiletheme"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db       *pgxpool.Pool
	verified *verifiedCache
}

func UserRepository(db *pgxpool.Pool) *Repository {
	r := &Repository{db: db}
	r.verified = newVerifiedCache(r.lookupVerified)
	return r
}

// userColumns e scanUser andam juntos: a ordem das colunas é a do Scan.
const userColumns = `
	id,
	username,
	display_name,
	email,
	password_hash,
	avatar_url,
	banner_url,
	banner_color,
	entrance_sound_url,
	pronouns,
	bio,
	status_text,
	links,
	status,
	name_font,
	name_effect,
	name_colors,
	profile_border,
	profile_border_colors,
	profile_background,
	profile_background_colors,
	profile_effect,
	profile_theme_extras,
	nameplate_mode,
	nameplate_url,
	avatar_decoration_url,
	friend_request_policy,
	allow_server_dms,
	active,
	email_verified_at,
	username_changed_at,
	created_at,
	updated_at
`

func scanUser(row pgx.Row) (*User, error) {
	user := &User{}
	err := row.Scan(
		&user.ID,
		&user.Username,
		&user.DisplayName,
		&user.Email,
		&user.PasswordHash,
		&user.AvatarURL,
		&user.BannerURL,
		&user.BannerColor,
		&user.EntranceSoundURL,
		&user.Pronouns,
		&user.Bio,
		&user.StatusText,
		&user.Links,
		&user.Status,
		&user.NameStyle.Font,
		&user.NameStyle.Effect,
		&user.NameStyle.Colors,
		&user.ProfileTheme.Border,
		&user.ProfileTheme.BorderColors,
		&user.ProfileTheme.Background,
		&user.ProfileTheme.BackgroundColors,
		&user.ProfileTheme.Effect,
		&user.ProfileTheme.Extras,
		&user.NameplateMode,
		&user.NameplateCustomURL,
		&user.AvatarDecorationURL,
		&user.FriendRequestPolicy,
		&user.AllowServerDMs,
		&user.Active,
		&user.EmailVerifiedAt,
		&user.UsernameChangedAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if user.Links == nil {
		user.Links = []ProfileLink{}
	}
	user.ProfileTheme.Extras = user.ProfileTheme.Extras.Filled()
	user.Look = cosmetics.Resolve(user.NameplateMode, user.BannerURL, user.NameplateCustomURL, user.AvatarDecorationURL)
	return user, nil
}

// Uma query fixa por coluna: nada de montar SQL com o nome da coluna.
var loginCandidatesQueries = map[loginColumn]string{
	loginByEmail:    `SELECT ` + userColumns + ` FROM users WHERE lower(email) = lower($1) ORDER BY (email = $1) DESC LIMIT 2`,
	loginByUsername: `SELECT ` + userColumns + ` FROM users WHERE lower(username) = lower($1) ORDER BY (username = $1) DESC LIMIT 2`,
}

// FindLoginCandidates traz até duas contas cuja coluna (username ou email)
// bate com value ignorando caixa, com a que bate exatamente primeiro.
// Duas linhas sem nenhuma exata = ambíguo (ver pickLoginMatch).
func (r *Repository) FindLoginCandidates(ctx context.Context, column loginColumn, value string) ([]User, error) {
	query, ok := loginCandidatesQueries[column]
	if !ok {
		return nil, fmt.Errorf("unknown login column %q", column)
	}
	rows, err := r.db.Query(ctx, query, value)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, *u)
	}
	return users, rows.Err()
}

// IdentityTaken diz se já existe conta com esse username ou e-mail, sem
// diferenciar caixa (usa os índices em lower() da migration 000025).
func (r *Repository) IdentityTaken(ctx context.Context, username, email string) (bool, error) {
	var taken bool
	err := r.db.QueryRow(
		ctx,
		`SELECT EXISTS(
			SELECT 1 FROM users
			WHERE lower(username) = lower($1) OR lower(email) = lower($2)
		)`,
		username,
		email,
	).Scan(&taken)
	return taken, err
}

// LoginIndexes diz se os índices da migration 000025 existem: o de
// lower(username) (único ou, com conflitos, comum) e o de lower(email).
func (r *Repository) LoginIndexes(ctx context.Context) (hasUsername, hasEmail bool, err error) {
	err = r.db.QueryRow(
		ctx,
		`SELECT
			EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'users'
				AND indexname IN ('users_username_lower_key', 'idx_users_username_lower')),
			EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'users'
				AND indexname = 'idx_users_email_lower')`,
	).Scan(&hasUsername, &hasEmail)
	return hasUsername, hasEmail, err
}

// CountCaseConflicts conta grupos de usernames e de e-mails iguais sem
// diferenciar caixa (só os números, sem nomes).
func (r *Repository) CountCaseConflicts(ctx context.Context) (usernameGroups, emailGroups int, err error) {
	err = r.db.QueryRow(
		ctx,
		`SELECT
			(SELECT count(*) FROM (SELECT 1 FROM users GROUP BY lower(username) HAVING count(*) > 1) u),
			(SELECT count(*) FROM (SELECT 1 FROM users GROUP BY lower(email) HAVING count(*) > 1) e)`,
	).Scan(&usernameGroups, &emailGroups)
	return usernameGroups, emailGroups, err
}

func (r *Repository) FindByEmail(ctx context.Context, email string) (*User, error) {
	return scanUser(r.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE email = $1`, email))
}

// FindByEmailFold acha pelo e-mail ignorando caixa (recuperação de senha).
func (r *Repository) FindByEmailFold(ctx context.Context, email string) (*User, error) {
	return scanUser(r.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE lower(email) = lower($1) ORDER BY (email = $1) DESC LIMIT 1`, email))
}

// MarkEmailVerified grava a confirmação do e-mail (mantém a data se já havia).
func (r *Repository) MarkEmailVerified(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE id = $1`, id)
	return err
}

// SetPassword troca o hash da senha.
func (r *Repository) SetPassword(ctx context.Context, id, hash string) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, id, hash)
	return err
}

func (r *Repository) FindByID(ctx context.Context, id string) (*User, error) {
	return scanUser(r.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id))
}

func (r *Repository) FindByUsername(ctx context.Context, username string) (*User, error) {
	return scanUser(r.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE username = $1`, username))
}

// FindByUsernameFold acha pelo username ignorando maiúsculas/minúsculas
// (pedido de amizade digitado à mão). Se houver "Hugo" e "hugo", prefere a
// caixa exata.
func (r *Repository) FindByUsernameFold(ctx context.Context, username string) (*User, error) {
	return scanUser(r.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE lower(username) = lower($1) AND NOT is_guest AND active ORDER BY (username = $1) DESC LIMIT 1`, username))
}

// UpdatePrivacy grava as opções de privacidade.
func (r *Repository) UpdatePrivacy(ctx context.Context, id string, p Privacy) (*User, error) {
	return scanUser(r.db.QueryRow(
		ctx,
		`UPDATE users SET friend_request_policy = $2, allow_server_dms = $3, updated_at = NOW()
		WHERE id = $1 RETURNING `+userColumns,
		id, p.FriendRequestPolicy, p.AllowServerDMs,
	))
}

// escapeLike escapa os curingas do LIKE/ILIKE (% e _) e a própria barra, para
// a busca tratar o texto digitado como literal (com ESCAPE '\').
func escapeLike(s string) string {
	return likeEscaper.Replace(s)
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// SearchByUsername busca por trecho do username. Não traz o e-mail: o
// resultado é de outras pessoas. Visitantes de call (usuários efêmeros, ver
// docs/adr/0017-visitante-na-call.md) e o "Usuário removido" (active = false,
// ADR 0038) não aparecem.
func (r *Repository) SearchByUsername(ctx context.Context, query string, excludeUserID string) ([]User, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT
			id,
			username,
			display_name,
			avatar_url,
			name_font,
			name_effect,
			name_colors,
			created_at,
			updated_at
		FROM users
		WHERE username ILIKE '%' || $1 || '%' ESCAPE '\'
		AND id <> $2
		AND NOT is_guest
		AND active
		AND NOT EXISTS (
			SELECT 1 FROM user_blocks b
			WHERE (b.blocker_id = $2 AND b.blocked_id = users.id)
			   OR (b.blocker_id = users.id AND b.blocked_id = $2)
		)
		LIMIT 20
		`,
		escapeLike(query),
		excludeUserID,
	)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, scanSearchResult)
}

// scanSearchResult lê uma linha da busca (as colunas de SearchByUsername).
func scanSearchResult(row pgx.CollectableRow) (User, error) {
	var u User
	err := row.Scan(
		&u.ID,
		&u.Username,
		&u.DisplayName,
		&u.AvatarURL,
		&u.NameStyle.Font,
		&u.NameStyle.Effect,
		&u.NameStyle.Colors,
		&u.CreatedAt,
		&u.UpdatedAt,
	)
	return u, err
}

func (r *Repository) Create(
	ctx context.Context,
	user *User,
) error {
	// As colunas do tema nascem com o padrão; o JSON da conta nova já sai igual.
	user.ProfileTheme = profiletheme.Default()
	return r.db.QueryRow(
		ctx,
		`
		INSERT INTO users (
			id,
			username,
			display_name,
			email,
			password_hash,
			avatar_url
		)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING
			pronouns,
			bio,
			status_text,
			links,
			status,
			active,
			created_at,
			updated_at
		`,
		user.ID,
		user.Username,
		user.DisplayName,
		user.Email,
		user.PasswordHash,
		user.AvatarURL,
	).Scan(
		&user.Pronouns,
		&user.Bio,
		&user.StatusText,
		&user.Links,
		&user.Status,
		&user.Active,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
}

// SetAvatar troca a URL do avatar e devolve a anterior (para apagar o arquivo).
func (r *Repository) SetAvatar(ctx context.Context, id string, url *string) (*User, *string, error) {
	return r.swapMedia(ctx, id, "avatar_url", url)
}

// SetBanner troca a URL do banner e devolve a anterior.
func (r *Repository) SetBanner(ctx context.Context, id string, url *string) (*User, *string, error) {
	return r.swapMedia(ctx, id, "banner_url", url)
}

// SetEntranceSound troca a URL do som de entrada e devolve a anterior.
func (r *Repository) SetEntranceSound(ctx context.Context, id string, url *string) (*User, *string, error) {
	return r.swapMedia(ctx, id, "entrance_sound_url", url)
}

// swapMedia lê a URL antiga e grava a nova na mesma transação. column vem
// sempre de SetAvatar/SetBanner/SetEntranceSound/SetDecoration, nunca do
// cliente.
func (r *Repository) swapMedia(ctx context.Context, id, column string, url *string) (*User, *string, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	var old *string
	if err := tx.QueryRow(ctx, `SELECT `+column+` FROM users WHERE id = $1 FOR UPDATE`, id).Scan(&old); err != nil {
		return nil, nil, err
	}
	user, err := scanUser(tx.QueryRow(
		ctx,
		`UPDATE users SET `+column+` = $2, updated_at = NOW() WHERE id = $1 RETURNING `+userColumns,
		id,
		url,
	))
	if err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}
	return user, old, nil
}

func (r *Repository) SetStatus(ctx context.Context, id string, status string) (*User, error) {
	return scanUser(r.db.QueryRow(
		ctx,
		`UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING `+userColumns,
		id,
		status,
	))
}

func (r *Repository) GetStatus(ctx context.Context, id string) (string, error) {
	var status string
	err := r.db.QueryRow(ctx, `SELECT status FROM users WHERE id = $1`, id).Scan(&status)
	return status, err
}
