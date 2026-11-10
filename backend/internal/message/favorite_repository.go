package message

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// SQL das mensagens favoritas (favorite.go).

var favoriteColumns = messageColumns + `,
	mf.created_at,
	mch.server_id,
	sv.name,
	mch.name,
	cv.type,
	cv.name,
	ou.id,
	ou.username,
	ou.display_name,
	ou.avatar_url
`

// favoriteFrom: a mensagem com a sala de origem. Na DM 1:1, ou é a outra
// pessoa (a que não é quem favoritou).
const favoriteFrom = `
	FROM message_favorites mf
	JOIN messages m ON m.id = mf.message_id
	JOIN users u ON u.id = m.author_id
	LEFT JOIN messages rm ON rm.id = m.reply_to_id
	LEFT JOIN users ru ON ru.id = rm.author_id
	LEFT JOIN server_stickers stk ON stk.id = m.sticker_id
` + messageProfileJoins + `
	LEFT JOIN servers sv ON sv.id = mch.server_id
	LEFT JOIN conversations cv ON cv.id = m.conversation_id
	LEFT JOIN users ou ON cv.type = 'dm'
		AND ou.id = CASE WHEN cv.user_a_id = mf.user_id THEN cv.user_b_id ELSE cv.user_a_id END
`

// AddFavorite favorita a mensagem (já favoritada não muda a ordem). Com max
// favoritos o próximo dá ErrFavoritesFull.
func (r *Repository) AddFavorite(ctx context.Context, userID, messageID string, max int) error {
	tag, err := r.db.Exec(
		ctx,
		`INSERT INTO message_favorites (user_id, message_id)
		SELECT $1::uuid, $2::uuid
		WHERE (SELECT COUNT(*) FROM message_favorites WHERE user_id = $1::uuid) < $3::int
			OR EXISTS (SELECT 1 FROM message_favorites WHERE user_id = $1::uuid AND message_id = $2::uuid)
		ON CONFLICT (user_id, message_id) DO UPDATE SET created_at = message_favorites.created_at`,
		userID, messageID, max,
	)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrFavoritesFull
	}
	return err
}

// RemoveFavorite tira a mensagem dos favoritos (o que não estava não é erro).
func (r *Repository) RemoveFavorite(ctx context.Context, userID, messageID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM message_favorites WHERE user_id = $1 AND message_id = $2`, userID, messageID)
	return err
}

// ListFavorites: os favoritos da pessoa, do mais recente ao mais antigo, sem
// reações nem anexos (AttachDetails, só nos que ela ainda lê).
func (r *Repository) ListFavorites(ctx context.Context, userID string) ([]Favorite, error) {
	rows, err := r.db.Query(ctx,
		`SELECT `+favoriteColumns+favoriteFrom+`
		WHERE mf.user_id = $1
		ORDER BY mf.created_at DESC, mf.message_id`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Favorite, error) { return scanFavorite(row) })
}

// FindFavorite: um favorito da pessoa; não favoritada dá ErrMessageNotFound.
func (r *Repository) FindFavorite(ctx context.Context, userID, messageID string) (*Favorite, error) {
	row := r.db.QueryRow(ctx,
		`SELECT `+favoriteColumns+favoriteFrom+`
		WHERE mf.user_id = $1 AND mf.message_id = $2`,
		userID, messageID,
	)
	fav, err := scanFavorite(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMessageNotFound
	}
	if err != nil {
		return nil, err
	}
	return &fav, nil
}

// FavoriteIDs: só os ids, do mais recente ao mais antigo.
func (r *Repository) FavoriteIDs(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.db.Query(ctx,
		`SELECT message_id::text FROM message_favorites WHERE user_id = $1 ORDER BY created_at DESC, message_id`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// AttachDetails põe as reações e os anexos nas mensagens.
func (r *Repository) AttachDetails(ctx context.Context, msgs []Message) error {
	if err := r.attachReactions(ctx, msgs); err != nil {
		return err
	}
	return r.AttachAttachments(ctx, msgs)
}

// favoriteOriginRow: as colunas da origem, que podem vir nulas (canal ou DM).
type favoriteOriginRow struct {
	serverID, serverName, channelName     *string
	convType, convName                    *string
	dmID, dmUsername, dmDisplay, dmAvatar *string
}

func (o favoriteOriginRow) origin() *FavoriteOrigin {
	origin := &FavoriteOrigin{
		ServerID:         orEmpty(o.serverID),
		ServerName:       orEmpty(o.serverName),
		ChannelName:      orEmpty(o.channelName),
		ConversationType: orEmpty(o.convType),
		ConversationName: orEmpty(o.convName),
	}
	if o.dmID != nil {
		origin.DMUser = &Author{ID: *o.dmID, Username: orEmpty(o.dmUsername), DisplayName: orEmpty(o.dmDisplay), AvatarURL: o.dmAvatar}
	}
	return origin
}

func orEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func scanFavorite(row scannable) (Favorite, error) {
	var fav Favorite
	var o favoriteOriginRow
	msg, err := scanMessageRow(row,
		&fav.FavoritedAt,
		&o.serverID, &o.serverName, &o.channelName,
		&o.convType, &o.convName,
		&o.dmID, &o.dmUsername, &o.dmDisplay, &o.dmAvatar,
	)
	if err != nil {
		return Favorite{}, err
	}
	fav.MessageID = msg.ID
	fav.Message = &msg
	fav.Origin = o.origin()
	return fav, nil
}
