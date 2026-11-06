package media

import (
	"errors"
	"mime/multipart"
	"net/http"
	"syscall"
)

// ErrNotMultipart: o corpo do upload não é multipart/form-data.
var ErrNotMultipart = errors.New("multipart/form-data required")

// UploadSpec diz como conferir o corpo de um upload multipart antes de lê-lo.
type UploadSpec struct {
	// Limit: maior Content-Length aceito (o arquivo mais a folga do multipart).
	Limit int64
	// Room: quanto precisa caber no disco quando o Content-Length não veio.
	Room int64
	// Cap: também corta a leitura em Limit (http.MaxBytesReader), para o
	// corpo sem Content-Length não passar do limite.
	Cap bool
	// SizeFirst: confere o Content-Length antes do espaço em disco.
	SizeFirst bool
	// FixedRoom: reserva sempre Room no disco, mesmo com Content-Length.
	FixedRoom bool
}

// OpenUpload confere o corpo de r antes de lê-lo e devolve o leitor das
// partes. Recusas, nesta ordem: syscall.ENOSPC (o Content-Length, ou
// spec.Room sem ele, não cabe no disco), ErrTooLarge (Content-Length acima de
// spec.Limit) e ErrNotMultipart. spec.SizeFirst e spec.FixedRoom mudam as
// duas primeiras.
func OpenUpload(w http.ResponseWriter, r *http.Request, space Room, spec UploadSpec) (*multipart.Reader, error) {
	if err := spec.checkBody(r.ContentLength, space); err != nil {
		return nil, err
	}
	if spec.Cap {
		r.Body = http.MaxBytesReader(w, r.Body, spec.Limit)
	}
	reader, err := r.MultipartReader()
	if err != nil {
		return nil, ErrNotMultipart
	}
	return reader, nil
}

// checkBody: o corpo de length bytes cabe no limite e no disco?
func (spec UploadSpec) checkBody(length int64, space Room) error {
	tooLarge := length > spec.Limit
	if spec.SizeFirst && tooLarge {
		return ErrTooLarge
	}
	if !space.HasRoom(spec.room(length)) {
		return syscall.ENOSPC
	}
	if tooLarge {
		return ErrTooLarge
	}
	return nil
}

// room: quanto reservar no disco para um corpo de length bytes (-1 = sem
// Content-Length).
func (spec UploadSpec) room(length int64) int64 {
	if length < 0 || spec.FixedRoom {
		return spec.Room
	}
	return length
}

// UploadErrors é a resposta de cada recusa conhecida de um upload (do
// OpenUpload, do ReadForm e do disco); cada domínio dá as suas mensagens.
type UploadErrors[T any] struct {
	MissingFile, BadForm, NotMultipart, TooLarge, NoSpace T
}

// For devolve a resposta de err; false se err não é uma recusa conhecida
// (falha nossa, que quem chama trata).
func (e UploadErrors[T]) For(err error) (T, bool) {
	var maxBytes *http.MaxBytesError
	switch {
	case errors.Is(err, ErrMissingFile):
		return e.MissingFile, true
	case errors.Is(err, ErrBadForm):
		return e.BadForm, true
	case errors.Is(err, ErrNotMultipart):
		return e.NotMultipart, true
	case errors.Is(err, ErrTooLarge), errors.As(err, &maxBytes):
		return e.TooLarge, true
	case errors.Is(err, syscall.ENOSPC):
		return e.NoSpace, true
	}
	var zero T
	return zero, false
}
