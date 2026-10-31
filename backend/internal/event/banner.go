package event

import (
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"syscall"
	"time"

	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	// BannerDir: pasta própria dentro de uploads, fora da raiz dos anexos do
	// chat (a limpeza dos anexos apaga o que não está em message_attachments).
	BannerDir = "event-media"

	// MaxBannerBytes: limite do banner (10 MB, como o banner do perfil).
	MaxBannerBytes int64 = 10 << 20

	// multipartOverhead: folga do corpo além do arquivo (campos e cabeçalhos).
	multipartOverhead = 16 << 10
)

var (
	errBannerTooLarge   = errors.New("Arquivo grande demais (máx. 10 MB).")
	errBannerNotImage   = errors.New("Só imagens PNG, JPEG ou WEBP.")
	errBannerNoSpace    = errors.New("server out of space")
	errBannerBadRequest = errors.New("multipart/form-data com o arquivo é obrigatório")
)

type spaceChecker interface {
	HasRoom(incoming int64) bool
}

type mediaTokens interface {
	VerifyMediaToken(token string) (userID string, err error)
}

// bannerFinder diz de qual servidor é o evento que usa o banner.
// eventAccess é o que o upload do banner usa da configuração de cargos.
type eventAccess interface {
	EventActions(ctx context.Context, serverID, userID string) (Actions, error)
}

type bannerFinder interface {
	ServerOfBanner(ctx context.Context, bannerID string) (serverID string, err error)
}

// BannerHandler recebe e entrega os banners dos eventos.
type BannerHandler struct {
	store   *media.Store
	space   spaceChecker
	access  eventAccess
	members memberChecker
	tokens  mediaTokens
	finder  bannerFinder
}

func NewBannerHandler(
	store *media.Store,
	space spaceChecker,
	access eventAccess,
	members memberChecker,
	tokens mediaTokens,
	finder bannerFinder,
) *BannerHandler {
	return &BannerHandler{store: store, space: space, access: access, members: members, tokens: tokens, finder: finder}
}

// uploadErr é a resposta de uma etapa do upload que recusou o pedido.
type uploadErr struct {
	status int
	code   string
	err    error
}

func refuse(status int, code string, err error) *uploadErr {
	return &uploadErr{status: status, code: code, err: err}
}

// Upload guarda o banner e devolve o id do arquivo; o evento o referencia por
// `banner_id` ao ser criado ou editado.
func (h *BannerHandler) Upload(c *gin.Context) {
	userID, ok := actor(c)
	if !ok {
		return
	}
	id := uuid.NewString()
	if ue := h.receive(c, c.Param("id"), userID, id); ue != nil {
		c.JSON(ue.status, gin.H{"error": ue.err.Error(), "code": ue.code})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"banner_id": id})
}

// receive confere quem envia e o corpo, salva o arquivo e valida o tipo.
func (h *BannerHandler) receive(c *gin.Context, serverID, userID, id string) *uploadErr {
	actions, err := h.access.EventActions(c.Request.Context(), serverID, userID)
	if err != nil {
		log.Printf("eventos: conferir permissões do banner: %v", err)
		return refuse(http.StatusInternalServerError, "", errors.New("failed to check permissions"))
	}
	// O banner é enviado ao criar ou ao editar o evento: basta poder uma das duas.
	if !actions.Has(ActionCreate) && !actions.Has(ActionEdit) {
		return refuse(http.StatusForbidden, "missing_permission", ErrMissingPermission)
	}
	if ue := h.checkBody(c); ue != nil {
		return ue
	}
	form, ue := h.readForm(c, id)
	if ue != nil {
		return ue
	}
	if _, ok := bannerType(form); !ok {
		_ = h.store.Remove(id)
		return refuse(http.StatusUnsupportedMediaType, "unsupported_image", errBannerNotImage)
	}
	return nil
}

// checkBody recusa corpo grande demais ou sem espaço em disco.
func (h *BannerHandler) checkBody(c *gin.Context) *uploadErr {
	if c.Request.ContentLength > MaxBannerBytes+multipartOverhead {
		return refuse(http.StatusRequestEntityTooLarge, "too_large", errBannerTooLarge)
	}
	if !h.space.HasRoom(MaxBannerBytes) {
		return refuse(http.StatusInsufficientStorage, "no_space", errBannerNoSpace)
	}
	return nil
}

func (h *BannerHandler) readForm(c *gin.Context, id string) (media.Form, *uploadErr) {
	reader, err := c.Request.MultipartReader()
	if err != nil {
		return media.Form{}, refuse(http.StatusBadRequest, "bad_request", errBannerBadRequest)
	}
	form, err := h.store.ReadForm(reader, media.FormSpec{ID: id, MaxFile: MaxBannerBytes, MaxField: 256})
	if err != nil {
		return media.Form{}, formError(err)
	}
	return form, nil
}

func formError(err error) *uploadErr {
	switch {
	case errors.Is(err, media.ErrMissingFile), errors.Is(err, media.ErrBadForm):
		return refuse(http.StatusBadRequest, "bad_request", errBannerBadRequest)
	case errors.Is(err, media.ErrTooLarge):
		return refuse(http.StatusRequestEntityTooLarge, "too_large", errBannerTooLarge)
	case errors.Is(err, syscall.ENOSPC):
		return refuse(http.StatusInsufficientStorage, "no_space", errBannerNoSpace)
	}
	log.Printf("eventos: salvar banner: %v", err)
	return refuse(http.StatusInternalServerError, "", errors.New("failed to save file"))
}

// bannerType: PNG, JPEG ou WEBP (decidido pelos bytes, nunca pelo que o
// cliente declarou). GIF e AVIF ficam de fora: o banner é imagem estática.
func bannerType(form media.Form) (string, bool) {
	kind, contentType, ok := media.Sniff(form.Head, form.Declared)
	if !ok || kind != media.KindImage {
		return "", false
	}
	switch contentType {
	case "image/png", "image/jpeg", "image/webp":
		return contentType, true
	}
	return "", false
}

// Serve entrega o banner só a membros do servidor do evento que o usa. O
// arquivo de um id nunca muda, então o navegador guarda para sempre.
func (h *BannerHandler) Serve(c *gin.Context) {
	userID, err := h.tokens.VerifyMediaToken(c.Query("token"))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid media token"})
		return
	}
	id := c.Param("bannerId")
	if !h.canSee(c.Request.Context(), id, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": ErrEventNotFound.Error()})
		return
	}
	file, err := h.store.Open(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": ErrEventNotFound.Error()})
		return
	}
	defer file.Close()
	contentType, ok := fileType(file)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": ErrEventNotFound.Error()})
		return
	}
	header := c.Writer.Header()
	header.Set("Content-Type", contentType)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Cache-Control", "private, max-age=31536000, immutable")
	http.ServeContent(c.Writer, c.Request, "", time.Time{}, file)
}

// canSee: o id é um UUID, algum evento usa esse banner e quem pede é membro
// do servidor dele. 404 também para quem não é membro, para não revelar que existe.
func (h *BannerHandler) canSee(ctx context.Context, bannerID, userID string) bool {
	if uuid.Validate(bannerID) != nil {
		return false
	}
	serverID, err := h.finder.ServerOfBanner(ctx, bannerID)
	if err != nil {
		return false
	}
	ok, err := h.members.IsMember(ctx, serverID, userID)
	return err == nil && ok
}

// fileType descobre o tipo pelos primeiros bytes e volta o arquivo ao começo.
func fileType(file io.ReadSeeker) (string, bool) {
	head := make([]byte, media.SniffLen)
	n, _ := io.ReadFull(file, head)
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return "", false
	}
	return bannerType(media.Form{Head: head[:n]})
}
