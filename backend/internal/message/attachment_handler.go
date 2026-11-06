package message

import (
	"context"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"syscall"
	"time"

	"gin-quickstart/backend/internal/platform/authctx"
	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	maxMediaDimension = 16384
	maxDurationMs     = 86_400_000
	// Folga para os cabeçalhos do multipart e os campos de texto.
	multipartOverhead = 1 << 20
)

type attachmentRepo interface {
	CreatePendingAttachment(ctx context.Context, a *storedAttachment) error
	FindAttachment(ctx context.Context, id string) (*storedAttachment, error)
}

type spaceChecker interface{ HasRoom(incoming int64) bool }

type MediaTokens interface {
	GenerateMediaToken(userID string) (string, time.Time, error)
	VerifyMediaToken(token string) (userID string, err error)
}

// AttachmentHandler recebe os uploads (cada arquivo sozinho, antes da
// mensagem) e serve os arquivos para quem tem acesso à sala.
type AttachmentHandler struct {
	repo         attachmentRepo
	store        *media.Store
	space        spaceChecker
	access       RoomAccess
	tokens       MediaTokens
	maxFileBytes int64 // media.MaxFileBytes; testes diminuem
}

func NewAttachmentHandler(repo attachmentRepo, store *media.Store, space spaceChecker, access RoomAccess, tokens MediaTokens) *AttachmentHandler {
	return &AttachmentHandler{
		repo:         repo,
		store:        store,
		space:        space,
		access:       access,
		tokens:       tokens,
		maxFileBytes: media.MaxFileBytes,
	}
}

func (h *AttachmentHandler) UploadToChannel(c *gin.Context) {
	h.upload(c, Room{ChannelID: c.Param("channelId")})
}

func (h *AttachmentHandler) UploadToConversation(c *gin.Context) {
	h.upload(c, Room{ConversationID: c.Param("id")})
}

// respondRoomError traduz o erro do RoomAccess em resposta HTTP.
func respondRoomError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrRoomNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, ErrBotConversation):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "bot_conversation"})
	case errors.Is(err, ErrNoRoomAccess), errors.Is(err, ErrCannotMessage), errors.Is(err, ErrBlocked):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check access"})
	}
}

func isTooLarge(err error) bool {
	var maxBytes *http.MaxBytesError
	return errors.Is(err, media.ErrTooLarge) || errors.As(err, &maxBytes)
}

// saveErrorStatus traduz o erro de gravar o arquivo. Disco cheio no meio do
// upload (dois uploads passaram pelo HasRoom juntos) responde como o HasRoom.
func saveErrorStatus(err error) (int, string) {
	switch {
	case isTooLarge(err):
		return http.StatusRequestEntityTooLarge, "file too large"
	case errors.Is(err, syscall.ENOSPC):
		return http.StatusInsufficientStorage, "server out of space"
	default:
		return http.StatusBadRequest, "invalid upload"
	}
}

func (h *AttachmentHandler) upload(c *gin.Context, room Room) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	uploaderID := userID.(string)
	ctx := c.Request.Context()

	if err := h.access.CanWrite(ctx, room, uploaderID); err != nil {
		respondRoomError(c, err)
		return
	}

	incoming := c.Request.ContentLength
	if incoming < 0 {
		incoming = h.maxFileBytes
	}
	if !h.space.HasRoom(incoming) {
		c.JSON(http.StatusInsufficientStorage, gin.H{"error": "server out of space"})
		return
	}
	if c.Request.ContentLength > h.maxFileBytes+multipartOverhead {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file too large"})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, h.maxFileBytes+multipartOverhead)

	reader, err := c.Request.MultipartReader()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid upload"})
		return
	}

	a := &storedAttachment{UploaderID: uploaderID}
	if room.ChannelID != "" {
		a.ChannelID = &room.ChannelID
	} else {
		a.ConversationID = &room.ConversationID
	}

	var (
		saved    bool
		keep     bool
		head     []byte
		declared string
	)
	// Qualquer saída antes do 201 apaga o arquivo que já foi para o disco.
	defer func() {
		if saved && !keep {
			if err := h.store.Remove(a.ID); err != nil {
				log.Printf("failed to remove rejected upload %s: %v", a.ID, err)
			}
		}
	}()

	// Os campos podem vir antes ou depois do arquivo; o arquivo vai direto
	// para o disco, sem passar pela memória.
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			if isTooLarge(err) {
				c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file too large"})
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid upload"})
			}
			return
		}

		switch part.FormName() {
		case "file":
			if saved {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid upload"})
				return
			}
			a.ID = uuid.NewString()
			a.Filename = sanitizeFilename(part.FileName())
			declared = part.Header.Get("Content-Type")
			a.SizeBytes, head, err = h.store.Save(a.ID, part, h.maxFileBytes)
			if err != nil {
				status, msg := saveErrorStatus(err)
				c.JSON(status, gin.H{"error": msg})
				return
			}
			saved = true
		case "width", "height", "duration_ms":
			raw, err := io.ReadAll(io.LimitReader(part, 32))
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid upload"})
				return
			}
			switch part.FormName() {
			case "width":
				a.Width = parseOptionalPositive(string(raw), maxMediaDimension)
			case "height":
				a.Height = parseOptionalPositive(string(raw), maxMediaDimension)
			default:
				a.DurationMs = parseOptionalPositive(string(raw), maxDurationMs)
			}
		default:
			io.Copy(io.Discard, part)
		}
		part.Close()
	}

	if !saved {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid upload"})
		return
	}

	kind, contentType, ok := media.Sniff(head, declared)
	if !ok {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "unsupported file type"})
		return
	}
	a.Kind = string(kind)
	a.ContentType = contentType

	if err := h.repo.CreatePendingAttachment(ctx, a); err != nil {
		log.Printf("failed to save attachment %s: %v", a.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save attachment"})
		return
	}
	keep = true

	c.JSON(http.StatusCreated, a.Attachment)
}

// MediaToken entrega o token curto que o app põe na URL dos arquivos.
func (h *AttachmentHandler) MediaToken(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	token, expiresAt, err := h.tokens.GenerateMediaToken(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create media token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "expires_at": expiresAt.UTC().Format(time.RFC3339)})
}

// ServeFile entrega o arquivo de um anexo. A cada pedido confere de novo se o
// dono do token ainda acessa a sala; quem não acessa recebe 404, sem saber se
// o arquivo existe.
func (h *AttachmentHandler) ServeFile(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid media token"})
		return
	}
	userID, err := h.tokens.VerifyMediaToken(token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid media token"})
		return
	}

	ctx := c.Request.Context()
	notFound := func() { c.JSON(http.StatusNotFound, gin.H{"error": "attachment not found"}) }

	a, err := h.repo.FindAttachment(ctx, c.Param("attachmentId"))
	if errors.Is(err, ErrAttachmentNotFound) {
		notFound()
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load attachment"})
		return
	}
	// Pendente: ainda não foi mandado em mensagem nenhuma.
	if a.MessageID == nil {
		notFound()
		return
	}

	room := Room{}
	if a.ChannelID != nil {
		room.ChannelID = *a.ChannelID
	} else if a.ConversationID != nil {
		room.ConversationID = *a.ConversationID
	}
	if err := h.access.CanRead(ctx, room, userID); err != nil {
		if errors.Is(err, ErrRoomNotFound) || errors.Is(err, ErrNoRoomAccess) {
			notFound()
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check access"})
		return
	}

	file, err := h.store.Open(a.ID)
	if err != nil {
		// Linha existe mas o arquivo sumiu do disco.
		log.Printf("attachment %s has no file: %v", a.ID, err)
		notFound()
		return
	}
	defer file.Close()

	header := c.Writer.Header()
	header.Set("Content-Type", a.ContentType)
	header.Set("X-Content-Type-Options", "nosniff")
	// O app web roda na mesma origem da mídia (e dos tokens no localStorage):
	// aberto direto, o arquivo não roda script nem carrega nada. Imagem,
	// vídeo e áudio dentro do app não são afetados.
	header.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	header.Set("Cache-Control", "private, max-age=3600")
	header.Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": a.Filename}))
	// ServeContent responde Range (seek de vídeo/áudio) e If-Modified-Since.
	http.ServeContent(c.Writer, c.Request, "", a.CreatedAt, file)
}
