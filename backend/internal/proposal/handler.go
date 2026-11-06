package proposal

import (
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"gin-quickstart/backend/internal/platform/media"
)

type Handler struct {
	service *Service
	images  *media.Store
	space   *media.Space
}

func ProposalHandler(service *Service, images *media.Store, space *media.Space) *Handler {
	return &Handler{service: service, images: images, space: space}
}

func (h *Handler) fail(c *gin.Context, err error) {
	var conflict *AssigneeConflictError
	switch {
	case errors.As(err, &conflict):
		// O card está com outro dev: o app confirma e manda de novo com take_over.
		c.JSON(http.StatusConflict, gin.H{"error": "assigned to another dev", "code": "assignee_conflict",
			"assignee_name": conflict.AssigneeName})
	case errors.Is(err, ErrInvalidGithubLogin):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid github username", "code": "invalid_github_username"})
	case errors.Is(err, ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "proposal not found"})
	case errors.Is(err, ErrCommentNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "comment not found"})
	case errors.Is(err, ErrInvalidTitle):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid title"})
	case errors.Is(err, ErrInvalidDescription):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid description"})
	case errors.Is(err, ErrInvalidImage):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid image"})
	case errors.Is(err, ErrInvalidComment):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid comment"})
	case errors.Is(err, ErrInvalidReply):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid reply"})
	case errors.Is(err, ErrInvalidAttachment):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid attachment"})
	case errors.Is(err, ErrInvalidEmoji):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid emoji"})
	case errors.Is(err, ErrTooManyReactions):
		c.JSON(http.StatusConflict, gin.H{"error": "too many different reactions", "code": "too_many_reactions"})
	case errors.Is(err, ErrInvalidStatus):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
	case errors.Is(err, ErrTooManyOpen):
		c.JSON(http.StatusConflict, gin.H{"error": "too many open proposals", "code": "too_many_open"})
	case errors.Is(err, ErrVotingClosed):
		c.JSON(http.StatusConflict, gin.H{"error": "voting closed", "code": "voting_closed"})
	case errors.Is(err, ErrRateLimited):
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many comments", "code": "rate_limited"})
	case errors.Is(err, ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	default:
		log.Printf("[proposal] %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
	}
}

// uuidParam lê e valida o parâmetro de rota; responde 400 e devolve false se
// não for um UUID.
func uuidParam(c *gin.Context, name string) (string, bool) {
	id := c.Param(name)
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return "", false
	}
	return id, true
}

func proposalID(c *gin.Context) (string, bool) { return uuidParam(c, "id") }

func (h *Handler) List(c *gin.Context) {
	board, err := h.service.Board(c.Request.Context(), c.GetString("userID"))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, board)
}

type contentBody struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	ImageIDs    []string `json:"image_ids"`
}

// validImageIDs descarta o pedido inteiro se alguma id não for UUID.
func validImageIDs(ids []string) bool {
	for _, id := range ids {
		if _, err := uuid.Parse(id); err != nil {
			return false
		}
	}
	return true
}

func (h *Handler) Create(c *gin.Context) {
	var body contentBody
	if err := c.ShouldBindJSON(&body); err != nil || !validImageIDs(body.ImageIDs) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	p, err := h.service.Create(c.Request.Context(), c.GetString("userID"), body.Title, body.Description, body.ImageIDs)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, p)
}

func (h *Handler) Update(c *gin.Context) {
	id, ok := proposalID(c)
	if !ok {
		return
	}
	var body contentBody
	if err := c.ShouldBindJSON(&body); err != nil || !validImageIDs(body.ImageIDs) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	p, err := h.service.Update(c.Request.Context(), id, c.GetString("userID"), body.Title, body.Description, body.ImageIDs)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, p)
}

func (h *Handler) Vote(c *gin.Context) {
	id, ok := proposalID(c)
	if !ok {
		return
	}
	var body struct {
		Approve *bool `json:"approve"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Approve == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	p, err := h.service.Vote(c.Request.Context(), id, c.GetString("userID"), *body.Approve)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, p)
}

func (h *Handler) RemoveVote(c *gin.Context) {
	id, ok := proposalID(c)
	if !ok {
		return
	}
	p, err := h.service.RemoveVote(c.Request.Context(), id, c.GetString("userID"))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, p)
}

func (h *Handler) SetStatus(c *gin.Context) {
	id, ok := proposalID(c)
	if !ok {
		return
	}
	var body struct {
		Status string `json:"status"`
		// TakeOver: confirmou tirar o card do dev que estava com ele.
		TakeOver bool `json:"take_over"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	p, err := h.service.SetStatus(c.Request.Context(), id, c.GetString("userID"), body.Status, body.TakeOver)
	if err != nil {
		h.failArchive(c, err)
		return
	}
	c.JSON(http.StatusOK, p)
}

// SetGithubUsername: PUT /proposals/github-username (só o time tech).
func (h *Handler) SetGithubUsername(c *gin.Context) {
	var body struct {
		Username string `json:"username"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	login, err := h.service.SetGithubUsername(c.Request.Context(), c.GetString("userID"), body.Username)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"github_username": login})
}

func (h *Handler) Delete(c *gin.Context) {
	id, ok := proposalID(c)
	if !ok {
		return
	}
	if err := h.service.Delete(c.Request.Context(), id, c.GetString("userID")); err != nil {
		h.fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// --- comentários ---

func (h *Handler) Comments(c *gin.Context) {
	id, ok := proposalID(c)
	if !ok {
		return
	}
	list, err := h.service.Comments(c.Request.Context(), id)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"comments": list})
}

func (h *Handler) AddComment(c *gin.Context) {
	id, ok := proposalID(c)
	if !ok {
		return
	}
	var body struct {
		Body          string   `json:"body"`
		Mentions      []string `json:"mentions"`
		ReplyToID     *string  `json:"reply_to_id"`
		AttachmentIDs []string `json:"attachment_ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || !validImageIDs(body.Mentions) || !validImageIDs(body.AttachmentIDs) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.ReplyToID != nil {
		if _, err := uuid.Parse(*body.ReplyToID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
	}
	comment, err := h.service.AddComment(c.Request.Context(), id, c.GetString("userID"), body.Body, body.Mentions, body.ReplyToID, body.AttachmentIDs)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, comment)
}

func (h *Handler) EditComment(c *gin.Context) {
	id, ok := proposalID(c)
	if !ok {
		return
	}
	commentID, ok := uuidParam(c, "commentId")
	if !ok {
		return
	}
	var body struct {
		Body string `json:"body"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	comment, err := h.service.EditComment(c.Request.Context(), id, commentID, c.GetString("userID"), body.Body)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, comment)
}

func (h *Handler) DeleteComment(c *gin.Context) {
	id, ok := proposalID(c)
	if !ok {
		return
	}
	commentID, ok := uuidParam(c, "commentId")
	if !ok {
		return
	}
	if err := h.service.DeleteComment(c.Request.Context(), id, commentID, c.GetString("userID")); err != nil {
		h.fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// --- imagens ---

// UploadImage recebe uma imagem (multipart, campo "file") e a deixa pendente
// até a proposta ser criada ou editada com a id dela.
func (h *Handler) UploadImage(c *gin.Context) {
	id := uuid.NewString()
	form, err := h.readUpload(c, id, MaxImageBytes)
	if err != nil {
		respondUploadError(c, err)
		return
	}
	kind, contentType, ok := media.Sniff(form.Head, "")
	if !ok || kind != media.KindImage {
		h.discardUpload(id)
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "unsupported file type"})
		return
	}
	if err := h.service.RegisterImage(c.Request.Context(), id, c.GetString("userID"), contentType, form.Size); err != nil {
		h.discardUpload(id)
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, Image{ID: id, URL: imageURL(id), ContentType: contentType})
}

// ServeImage entrega a imagem sem token: <img> não manda Bearer, o GitHub
// precisa buscá-la e o nome é um UUID novo a cada upload (não dá para
// adivinhar, e a resposta pode ficar em cache para sempre).
func (h *Handler) ServeImage(c *gin.Context) {
	notFound := func() { c.JSON(http.StatusNotFound, gin.H{"error": "media not found"}) }

	id := c.Param("id")
	if parsed, err := uuid.Parse(id); err != nil || parsed.String() != id {
		notFound()
		return
	}
	// O tipo vem do banco, mas só vale se o arquivo ainda é uma imagem (o
	// banco pode ter sobrado de um arquivo trocado).
	if _, err := h.service.ImageContentType(c.Request.Context(), id); err != nil {
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
	if !ok || kind != media.KindImage {
		notFound()
		return
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
