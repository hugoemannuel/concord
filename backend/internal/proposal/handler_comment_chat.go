package proposal

import (
	"io"
	"net/http"
	"path"
	"strconv"
	"strings"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"gin-quickstart/backend/internal/platform/media"
)

const (
	maxMediaDimension = 16384
	maxDurationMs     = 86_400_000
)

// React: POST /proposals/:id/comments/:commentId/reactions {"emoji": "👍"}.
func (h *Handler) React(c *gin.Context) {
	id, ok := proposalID(c)
	if !ok {
		return
	}
	commentID, ok := uuidParam(c, "commentId")
	if !ok {
		return
	}
	var body struct {
		Emoji string `json:"emoji"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	comment, err := h.service.React(c.Request.Context(), id, commentID, c.GetString("userID"), body.Emoji)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, comment)
}

// Unreact: DELETE /proposals/:id/comments/:commentId/reactions?emoji=👍 (como no chat).
func (h *Handler) Unreact(c *gin.Context) {
	id, ok := proposalID(c)
	if !ok {
		return
	}
	commentID, ok := uuidParam(c, "commentId")
	if !ok {
		return
	}
	comment, err := h.service.Unreact(c.Request.Context(), id, commentID, c.GetString("userID"), c.Query("emoji"))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, comment)
}

// UploadCommentMedia recebe um anexo de comentário (multipart, campo "file", e
// opcionalmente width, height e duration_ms) e o deixa pendente até o
// comentário ser criado com a id dele.
func (h *Handler) UploadCommentMedia(c *gin.Context) {
	id := uuid.NewString()
	// Os campos podem vir antes ou depois do arquivo, que vai direto para o disco.
	form, err := h.readUpload(c, id, media.MaxFileBytes, "width", "height", "duration_ms")
	if err != nil {
		respondUploadError(c, err)
		return
	}
	row, ok := commentAttachmentRow(id, c.GetString("userID"), form)
	if !ok {
		h.discardUpload(id)
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "unsupported file type"})
		return
	}
	attachment, err := h.service.RegisterCommentAttachment(c.Request.Context(), row)
	if err != nil {
		h.discardUpload(id)
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, attachment)
}

// commentAttachmentRow monta o anexo pendente do upload; false se o tipo do
// arquivo não é aceito.
func commentAttachmentRow(id, uploaderID string, form media.Form) (CommentAttachmentRow, bool) {
	kind, contentType, ok := media.Sniff(form.Head, form.Declared)
	if !ok {
		return CommentAttachmentRow{}, false
	}
	return CommentAttachmentRow{
		ID:          id,
		UploaderID:  uploaderID,
		Kind:        string(kind),
		ContentType: contentType,
		Filename:    sanitizeFilename(form.Filename),
		SizeBytes:   form.Size,
		Width:       parseOptionalPositive(form.Fields["width"], maxMediaDimension),
		Height:      parseOptionalPositive(form.Fields["height"], maxMediaDimension),
		DurationMs:  parseOptionalPositive(form.Fields["duration_ms"], maxDurationMs),
	}, true
}

// ServeCommentMedia entrega o anexo de um comentário sem token (<img>, <video> e
// <audio> não mandam Bearer, e o nome é um UUID novo a cada upload). Como em
// ServeImage, o tipo vale só se o arquivo ainda é do tipo guardado no banco, e
// a resposta sai com nosniff e CSP sandbox: nada aqui roda como página.
func (h *Handler) ServeCommentMedia(c *gin.Context) {
	notFound := func() { c.JSON(http.StatusNotFound, gin.H{"error": "media not found"}) }

	id := c.Param("id")
	if parsed, err := uuid.Parse(id); err != nil || parsed.String() != id {
		notFound()
		return
	}
	storedKind, storedType, err := h.service.CommentAttachmentMeta(c.Request.Context(), id)
	if err != nil {
		notFound()
		return
	}
	file, err := h.images.Open(id)
	if err != nil {
		notFound()
		return
	}
	defer file.Close()

	head := make([]byte, media.SniffLen)
	n, _ := io.ReadFull(file, head)
	kind, contentType, ok := media.Sniff(head[:n], "")
	if !ok || string(kind) != storedKind {
		// mp4 de áudio e de vídeo são o mesmo contêiner: o Sniff sem o tipo
		// declarado pode dizer "vídeo" para um m4a antigo. Confia no banco só para
		// essa troca, nunca para fora de image/video/audio.
		if !(ok && sameMP4Family(string(kind), storedKind)) {
			notFound()
			return
		}
		contentType = storedType
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		notFound()
		return
	}
	info, err := file.Stat()
	if err != nil {
		notFound()
		return
	}

	header := c.Writer.Header()
	header.Set("Content-Type", contentType)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Content-Security-Policy", "sandbox")
	header.Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeContent(c.Writer, c.Request, "", info.ModTime(), file)
}

func sameMP4Family(sniffed, stored string) bool {
	return (sniffed == "video" || sniffed == "audio") && (stored == "video" || stored == "audio") &&
		sniffed != stored
}

// sanitizeFilename deixa só o nome do arquivo, sem caminho nem caracteres de controle.
func sanitizeFilename(name string) string {
	name = path.Base(strings.ReplaceAll(name, `\`, "/"))
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if runes := []rune(name); len(runes) > 200 {
		name = string(runes[:200])
	}
	if name == "" || name == "." || name == ".." || name == "/" {
		return "arquivo"
	}
	return name
}

// parseOptionalPositive lê um campo numérico opcional do upload; vazio,
// inválido ou fora de 1..max vira nil.
func parseOptionalPositive(raw string, max int) *int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n <= 0 || n > max {
		return nil
	}
	return &n
}
