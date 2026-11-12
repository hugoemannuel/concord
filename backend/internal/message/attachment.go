package message

import (
	"errors"
	"path"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// MaxMessageLength é o tamanho máximo do texto, em caracteres (o mesmo CHECK
// do banco, char_length(content) <= 4000).
const MaxMessageLength = 4000

// MaxAttachmentsPerMessage é quantos arquivos cabem numa mensagem (como no Discord).
const MaxAttachmentsPerMessage = 10

var (
	ErrContentTooLong     = errors.New("content is too long")
	ErrTooManyAttachments = errors.New("a message can have at most 10 attachments")
	ErrInvalidAttachment  = errors.New("invalid attachment")
	ErrAttachmentNotFound = errors.New("attachment not found")
)

type Attachment struct {
	ID          string `json:"id"`
	Kind        string `json:"kind"` // image | video | audio
	ContentType string `json:"content_type"`
	Filename    string `json:"filename"`
	SizeBytes   int64  `json:"size_bytes"`
	Width       *int   `json:"width,omitempty"`
	Height      *int   `json:"height,omitempty"`
	DurationMs  *int   `json:"duration_ms,omitempty"`
}

// storedAttachment é a linha completa (uso interno: upload, download, limpeza).
type storedAttachment struct {
	Attachment
	UploaderID     string
	MessageID      *string
	ChannelID      *string
	ConversationID *string
	CreatedAt      time.Time
	ViewOnce       bool // visualização única: só abre com o token view_once
	ViewOnceGone   bool // todos viram ou venceu: o arquivo já foi apagado
}

// validateContent: texto de até MaxMessageLength caracteres; só mensagem com
// anexo pode ficar sem texto (só espaços conta como sem texto).
func validateContent(content string, hasAttachments bool) error {
	if strings.TrimSpace(content) == "" && !hasAttachments {
		return ErrContentRequired
	}
	if utf8.RuneCountInString(content) > MaxMessageLength {
		return ErrContentTooLong
	}
	return nil
}

// validateNewMessage confere texto e anexos antes de ir ao banco. A posse e a
// sala de cada anexo são conferidas na transação (CreateWithAttachments).
func validateNewMessageWithMedia(content string, attachmentIDs []string, hasOtherMedia bool) error {
	if err := validateContent(content, len(attachmentIDs) > 0 || hasOtherMedia); err != nil {
		return err
	}
	if len(attachmentIDs) > MaxAttachmentsPerMessage {
		return ErrTooManyAttachments
	}
	seen := make(map[string]bool, len(attachmentIDs))
	for _, id := range attachmentIDs {
		if id == "" || seen[id] {
			return ErrInvalidAttachment
		}
		seen[id] = true
	}
	return nil
}

func validateNewMessage(content string, attachmentIDs []string) error {
	return validateNewMessageWithMedia(content, attachmentIDs, false)
}


// sanitizeFilename guarda só o nome (sem pastas nem caracteres de controle),
// com até 200 caracteres. Ele só aparece na tela e no Content-Disposition;
// no disco o arquivo se chama pelo id.
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

// parseOptionalPositive lê um campo numérico opcional do upload (largura,
// altura, duração); vazio, inválido ou fora de 1..max → nil.
func parseOptionalPositive(raw string, max int) *int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n <= 0 || n > max {
		return nil
	}
	return &n
}
