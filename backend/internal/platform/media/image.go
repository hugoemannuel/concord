package media

import (
	"io"
	"net/http"
	"os"
	"time"
)

// ImageOpener: de onde ServeImage lê o arquivo (Store).
type ImageOpener interface {
	Open(id string) (*os.File, error)
}

// ServeImage entrega uma imagem guardada (prévia de link, imagem de enquete)
// sem login: um <img> não manda Authorization. Só sai o que os bytes dizem ser
// imagem (PNG, JPEG, GIF, WebP), com nosniff e CSP sandbox: aberta direto, na
// origem do app web, não roda nada. false = não achou (quem chama responde 404).
func ServeImage(w http.ResponseWriter, r *http.Request, files ImageOpener, id string) bool {
	f, contentType, ok := openImage(files, id)
	if !ok {
		return false
	}
	defer f.Close()
	var modTime time.Time
	if info, err := f.Stat(); err == nil {
		modTime = info.ModTime()
	}
	header := w.Header()
	header.Set("Content-Type", contentType)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	header.Set("Cache-Control", "public, max-age=86400")
	http.ServeContent(w, r, "", modTime, f)
	return true
}

// openImage abre o arquivo e confere pelos bytes que é imagem.
func openImage(files ImageOpener, id string) (*os.File, string, bool) {
	f, err := files.Open(id)
	if err != nil {
		return nil, "", false
	}
	head := make([]byte, SniffLen)
	n, _ := io.ReadFull(f, head)
	kind, contentType, ok := Sniff(head[:n], "")
	if _, err := f.Seek(0, io.SeekStart); err != nil || !ok || kind != KindImage {
		f.Close()
		return nil, "", false
	}
	return f, contentType, true
}
