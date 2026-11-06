package soundboard

import (
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode"
)

const (
	// MaxSoundBytes é o limite de tamanho por som da mesa de áudio (5 MB).
	MaxSoundBytes int64 = 5 << 20

	// MinSoundDurationMs e MaxSoundDurationMs limitam a duração do clipe (0.1s a 15s).
	MinSoundDurationMs = 100
	MaxSoundDurationMs = 15_000

	// MaxSoundsPerServer limita quantos sons um servidor pode guardar.
	MaxSoundsPerServer = 50

	// MaxFavoritesPerUser limita quantos sons cada pessoa favorita.
	MaxFavoritesPerUser = 100

	MaxNameRunes  = 32
	MaxEmojiRunes = 16
)

var (
	ErrSoundNotFound     = errors.New("sound not found")
	ErrServerFull        = errors.New("server soundboard limit reached")
	ErrInvalidName       = errors.New("sound name is required (max 32 characters)")
	ErrInvalidDuration   = errors.New("sound duration must be between 0.1s and 15s")
	ErrNotServerMember   = errors.New("you are not a member of this server")
	ErrCannotEditSound   = errors.New("Só quem enviou ou quem gerencia expressões pode editar este som.")
	ErrCannotDeleteSound = errors.New("only the uploader, moderators or server owner can delete this sound")
	ErrCannotAddSound    = errors.New("você não tem permissão para adicionar sons neste servidor")
	ErrFavoritesFull     = errors.New("limite de sons favoritos atingido")
)

type Sound struct {
	ID           string    `json:"id"`
	ServerID     string    `json:"server_id"`
	UploaderID   string    `json:"uploader_id"`
	UploaderName string    `json:"uploader_name"`
	Name         string    `json:"name"`
	Emoji        *string   `json:"emoji,omitempty"`
	ContentType  string    `json:"content_type"`
	SizeBytes    int64     `json:"size_bytes"`
	DurationMs   int       `json:"duration_ms"`
	CreatedAt    time.Time `json:"created_at"`
}

// ServerSounds: os sons de um servidor de que a pessoa é membro, com o que a
// mesa mostra no trilho e no título da seção (nome e ícone do servidor).
type ServerSounds struct {
	ServerID      string  `json:"server_id"`
	ServerName    string  `json:"server_name"`
	ServerIconURL *string `json:"server_icon_url,omitempty"`
	Sounds        []Sound `json:"sounds"`
}

// FavoriteSound é um som favorito, com o nome do servidor de onde ele é.
type FavoriteSound struct {
	Sound
	ServerName string `json:"server_name"`
}

type CreatedEvent struct {
	ServerID string `json:"server_id"`
	Sound    Sound  `json:"sound"`
}

type UpdatedEvent struct {
	ServerID string `json:"server_id"`
	Sound    Sound  `json:"sound"`
}

type DeletedEvent struct {
	ServerID string `json:"server_id"`
	SoundID  string `json:"sound_id"`
}

func sanitizeName(raw string) (string, error) {
	clean := strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, raw)
	clean = strings.TrimSpace(clean)
	runes := []rune(clean)
	if len(runes) == 0 || len(runes) > MaxNameRunes {
		return "", ErrInvalidName
	}
	return clean, nil
}

func sanitizeEmoji(raw string) *string {
	clean := strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, raw)
	clean = strings.TrimSpace(clean)
	if clean == "" {
		return nil
	}
	runes := []rune(clean)
	if len(runes) > MaxEmojiRunes {
		clean = string(runes[:MaxEmojiRunes])
	}
	return &clean
}

func marshalEvent(typ string, payload interface{}) []byte {
	data, err := json.Marshal(map[string]interface{}{
		"type":    typ,
		"payload": payload,
	})
	if err != nil {
		return nil
	}
	return data
}
