package conversation

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

// ErrInvalidDisappearing: o prazo não é um dos permitidos.
var ErrInvalidDisappearing = errors.New("invalid disappearing duration")

// NoticeKindDisappearing é o system_kind do aviso postado na conversa.
const NoticeKindDisappearing = "disappearing"

// disappearingLabels: os prazos permitidos (em segundos) e o texto do aviso.
var disappearingLabels = map[int]string{
	86400:   "24 horas",
	604800:  "7 dias",
	7776000: "90 dias",
}

// ValidDisappearing aceita nil (desativado) ou um dos três prazos.
func ValidDisappearing(seconds *int) error {
	if seconds == nil {
		return nil
	}
	if _, ok := disappearingLabels[*seconds]; !ok {
		return ErrInvalidDisappearing
	}
	return nil
}

// DisappearingNotice monta o aviso mostrado na conversa quando o modo muda.
func DisappearingNotice(actorName string, seconds *int) string {
	if seconds == nil {
		return actorName + " desativou as mensagens temporárias."
	}
	return fmt.Sprintf("%s ativou as mensagens temporárias. Novas mensagens vão sumir após %s.", actorName, disappearingLabels[*seconds])
}

// SetDisappearing grava o prazo da conversa (nil desativa).
func (r *Repository) SetDisappearing(ctx context.Context, conversationID string, seconds *int) error {
	_, err := r.db.Exec(ctx, `UPDATE conversations SET disappearing_seconds = $2 WHERE id = $1`, conversationID, seconds)
	return err
}

// NoticePoster posta o aviso na conversa (implementado pelo message.Service;
// o message já importa conversation, então a ligação é feita no cmd/).
type NoticePoster interface {
	PostConversationNotice(ctx context.Context, conversationID, authorID, content, kind string) error
}

type disappearingStore interface {
	SetDisappearing(ctx context.Context, conversationID string, seconds *int) error
}

// DisappearingService liga e desliga as mensagens temporárias de uma conversa.
type DisappearingService struct {
	repo          disappearingStore
	isParticipant func(ctx context.Context, conversationID, userID string) (bool, error)
	actorName     func(ctx context.Context, userID string) (string, error)
	notices       NoticePoster
	publish       func(eventType, conversationID string)
}

// NewDisappearingService liga o serviço ao repositório, ao Service (eventos
// para os membros) e ao nome de quem muda o modo.
func NewDisappearingService(repo *Repository, svc *Service, actorName func(ctx context.Context, userID string) (string, error), notices NoticePoster) *DisappearingService {
	return &DisappearingService{
		repo:          repo,
		isParticipant: repo.IsMember,
		actorName:     actorName,
		notices:       notices,
		publish: func(eventType, conversationID string) {
			svc.publishToMembers(context.Background(), eventType, conversationID)
		},
	}
}

// Set valida o prazo, confere que userID participa, grava, avisa na conversa
// e publica conversation:update aos membros.
func (s *DisappearingService) Set(ctx context.Context, userID, conversationID string, seconds *int) error {
	if err := ValidDisappearing(seconds); err != nil {
		return err
	}
	if ok, err := s.isParticipant(ctx, conversationID, userID); err != nil || !ok {
		return ErrNotParticipant
	}
	name, err := s.actorName(ctx, userID)
	if err != nil {
		return err
	}
	if err := s.repo.SetDisappearing(ctx, conversationID, seconds); err != nil {
		return err
	}
	// Publica logo após gravar: se o aviso falhar, os clientes já sabem do modo.
	s.publish(EventUpdate, conversationID)
	return s.notices.PostConversationNotice(ctx, conversationID, userID, DisappearingNotice(name, seconds), NoticeKindDisappearing)
}

// ActorNameFrom devolve display_name, ou o username como reserva.
func ActorNameFrom(users *user.Service) func(ctx context.Context, userID string) (string, error) {
	return func(ctx context.Context, userID string) (string, error) {
		u, err := users.FindByID(ctx, userID)
		if err != nil {
			return "", err
		}
		if u.DisplayName != "" {
			return u.DisplayName, nil
		}
		return u.Username, nil
	}
}

// SetDisappearing: PUT /conversations/:id/disappearing, corpo {"seconds": n|null}.
func (h *Handler) SetDisappearing(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	var body struct {
		Seconds *int `json:"seconds"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	err := h.disappearing.Set(c.Request.Context(), userID, c.Param("id"), body.Seconds)
	if errors.Is(err, ErrInvalidDisappearing) {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
