package media

import (
	"errors"
	"io"
	"net/http"
	"syscall"

	"github.com/google/uuid"
)

// Clipes de áudio curtos de uma pessoa (som de entrada, sons do app): o corpo
// do POST é o próprio arquivo e o tipo sai dos bytes, nunca do Content-Type.

var ErrNotAudio = errors.New("not an audio file")

// Room diz se cabe mais um upload no disco (o Space).
type Room interface{ HasRoom(incoming int64) bool }

// SniffAudio aceita só os áudios do Sniff (os mesmos da mesa de áudio).
func SniffAudio(head []byte, declared string) (string, bool) {
	kind, contentType, ok := Sniff(head, declared)
	return contentType, ok && kind == KindAudio
}

// SaveAudio grava o corpo com um nome novo (devolvido) e confere que é áudio
// de verdade; accept filtra os tipos (nil = qualquer áudio do Sniff). Em
// qualquer erro não sobra arquivo.
func SaveAudio(store *Store, space Room, r *http.Request, limit int64, accept func(contentType string) bool) (string, error) {
	if !space.HasRoom(max(r.ContentLength, limit)) {
		return "", syscall.ENOSPC
	}
	id := uuid.NewString()
	_, head, err := store.Save(id, r.Body, limit)
	if err != nil {
		return "", err
	}
	contentType, ok := SniffAudio(head, r.Header.Get("Content-Type"))
	if !ok || (accept != nil && !accept(contentType)) {
		_ = store.Remove(id)
		return "", ErrNotAudio
	}
	return id, nil
}

// ServeAudio entrega o clipe sem token, como o avatar: o <audio> não manda
// Bearer e o nome é um UUID novo a cada upload (não dá para adivinhar e pode
// ficar em cache para sempre). false = não achou (quem chama responde 404).
func ServeAudio(w http.ResponseWriter, r *http.Request, store *Store, id string) bool {
	file, err := store.Open(id)
	if err != nil {
		return false
	}
	defer file.Close()

	head := make([]byte, SniffLen)
	n, _ := io.ReadFull(file, head)
	// "audio/" desempata m4a e webm, que o Sniff também reconhece como vídeo.
	contentType, ok := SniffAudio(head[:n], "audio/")
	if !ok {
		return false
	}
	info, err := file.Stat()
	if err != nil {
		return false
	}

	header := w.Header()
	header.Set("Content-Type", contentType)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Cache-Control", "public, max-age=31536000, immutable")
	// ServeContent volta ao começo do arquivo antes de responder.
	http.ServeContent(w, r, "", info.ModTime(), file)
	return true
}
