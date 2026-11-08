package message

import (
	"context"
	"errors"
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
	uploaderID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()
	if err := h.access.CanWrite(ctx, room, uploaderID); err != nil {
		respondRoomError(c, err)
		return
	}
	a := newStoredAttachment(uploaderID, room)
	form, err := h.readForm(c, a.ID)
	if err != nil {
		status, msg := saveErrorStatus(err)
		c.JSON(status, gin.H{"error": msg})
		return
	}
	if status, msg := h.register(ctx, a, form); status != http.StatusCreated {
		// Qualquer saída antes do 201 apaga o arquivo que já foi para o disco.
		h.discard(a.ID)
		c.JSON(status, gin.H{"error": msg})
		return
	}
	c.JSON(http.StatusCreated, a.Attachment)
}

// newStoredAttachment: o anexo novo de uploaderID na sala, ainda sem arquivo.
func newStoredAttachment(uploaderID string, room Room) *storedAttachment {
	a := &storedAttachment{Attachment: Attachment{ID: uuid.NewString()}, UploaderID: uploaderID}
	if room.ChannelID != "" {
		a.ChannelID = &room.ChannelID
	} else {
		a.ConversationID = &room.ConversationID
	}
	return a
}

// readForm confere o corpo (espaço em disco e tamanho) e salva o arquivo em
// id. Os campos podem vir antes ou depois do arquivo; o arquivo vai direto
// para o disco, sem passar pela memória.
func (h *AttachmentHandler) readForm(c *gin.Context, id string) (media.Form, error) {
	reader, err := media.OpenUpload(c.Writer, c.Request, h.space, media.UploadSpec{
		Limit: h.maxFileBytes + multipartOverhead,
		Room:  h.maxFileBytes,
		Cap:   true,
	})
	if err != nil {
		return media.Form{}, err
	}
	return h.store.ReadForm(reader, media.FormSpec{
		ID:       id,
		MaxFile:  h.maxFileBytes,
		MaxField: 32,
		Fields:   []string{"width", "height", "duration_ms"},
	})
}

// register confere o tipo do arquivo e grava o anexo pendente; devolve 201
// ou o status e a mensagem da recusa.
func (h *AttachmentHandler) register(ctx context.Context, a *storedAttachment, form media.Form) (int, string) {
	kind, contentType, ok := media.Sniff(form.Head, form.Declared)
	if !ok {
		return http.StatusUnsupportedMediaType, "unsupported file type"
	}
	a.Kind, a.ContentType = string(kind), contentType
	a.Filename = sanitizeFilename(form.Filename)
	a.SizeBytes = form.Size
	a.Width = parseOptionalPositive(form.Fields["width"], maxMediaDimension)
	a.Height = parseOptionalPositive(form.Fields["height"], maxMediaDimension)
	a.DurationMs = parseOptionalPositive(form.Fields["duration_ms"], maxDurationMs)
	if err := h.repo.CreatePendingAttachment(ctx, a); err != nil {
		log.Printf("failed to save attachment %s: %v", a.ID, err)
		return http.StatusInternalServerError, "failed to save attachment"
	}
	return http.StatusCreated, ""
}

func (h *AttachmentHandler) discard(id string) {
	if err := h.store.Remove(id); err != nil {
		log.Printf("failed to remove rejected upload %s: %v", id, err)
	}
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

	setFileHeaders(c.Writer.Header(), a)
	// ServeContent responde Range (seek de vídeo/áudio) e If-Modified-Since.
	http.ServeContent(c.Writer, c.Request, "", a.CreatedAt, file)
}

// setFileHeaders: tipo, cache e as proteções de quem abre o arquivo direto.
func setFileHeaders(header http.Header, a *storedAttachment) {
	header.Set("Content-Type", a.ContentType)
	header.Set("X-Content-Type-Options", "nosniff")
	// O app web roda na mesma origem da mídia (e dos tokens no localStorage):
	// aberto direto, o arquivo não roda script nem carrega nada. Imagem,
	// vídeo e áudio dentro do app não são afetados.
	header.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	header.Set("Cache-Control", "private, max-age=3600")
	header.Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": a.Filename}))
}
