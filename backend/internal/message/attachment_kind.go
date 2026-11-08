package message

import "gin-quickstart/backend/internal/platform/media"

const (
	textContentType   = "text/plain; charset=utf-8"
	binaryContentType = "application/octet-stream"
)

// classify decide o tipo do anexo pelos bytes: imagem, vídeo ou áudio que o
// Sniff reconhece; o resto é "file", texto (com prévia no app) ou binário.
// declared só desempata mp4/webm entre vídeo e áudio.
func classify(head []byte, declared string) (kind, contentType string) {
	if k, ct, ok := media.Sniff(head, declared); ok {
		return string(k), ct
	}
	if media.SniffText(head) {
		return string(media.KindFile), textContentType
	}
	return string(media.KindFile), binaryContentType
}

// disposition: arquivo genérico sempre baixa (attachment), para o navegador
// nunca abrir HTML, SVG ou PDF enviado na origem do app; mídia abre inline.
func disposition(kind string) string {
	if kind == string(media.KindFile) {
		return "attachment"
	}
	return "inline"
}
