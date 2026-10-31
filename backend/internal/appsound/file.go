package appsound

import (
	"errors"
	"slices"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

// Áudio próprio de um evento: curto e leve, é um aviso, não música.
const (
	// FilesDir: subpasta da mídia de perfil (fora da limpeza dos anexos).
	FilesDir = "app-sounds"

	MaxFileBytes int64 = 1 << 20
	MinFileMs          = 100
	MaxFileMs          = 5_000
)

var ErrInvalidDuration = errors.New("o som precisa ter entre 0,1 s e 5 s")

// acceptedTypes: mp3, ogg, wav e m4a (o webm do Sniff fica de fora).
var acceptedTypes = []string{"audio/mpeg", "audio/ogg", "audio/wav", "audio/mp4"}

func acceptedType(contentType string) bool { return slices.Contains(acceptedTypes, contentType) }

const filePath = "/api/app-sounds/"

// fileURL é o endereço público do arquivo (o app junta a origem).
func fileURL(id string) string { return filePath + id }

// parseDuration confere a duração que o app mediu (o servidor não decodifica
// o áudio, como no som de entrada e na mesa de áudio).
func parseDuration(raw string) (int, error) {
	ms, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || ms < MinFileMs || ms > MaxFileMs {
		return 0, ErrInvalidDuration
	}
	return ms, nil
}

// parseFileID aceita só UUID canônico (o nome do arquivo no disco).
func parseFileID(raw string) (string, bool) {
	parsed, err := uuid.Parse(raw)
	if err != nil || parsed.String() != raw {
		return "", false
	}
	return raw, true
}
