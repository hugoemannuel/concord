package proposal

import (
	"context"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

func (s *Service) Comments(ctx context.Context, proposalID string) ([]Comment, error) {
	if _, err := s.store.Get(ctx, proposalID, nil); err != nil {
		return nil, err
	}
	return s.store.ListComments(ctx, proposalID)
}

// cleanComment aparda o texto. Só um comentário com anexo pode ficar sem texto.
func cleanComment(body string, hasAttachments bool) (string, error) {
	body = strings.TrimSpace(body)
	n := utf8.RuneCountInString(body)
	if n > MaxCommentLen || (n == 0 && !hasAttachments) {
		return "", ErrInvalidComment
	}
	return body, nil
}

// validEmoji: o mesmo critério do chat (não vazio, até 32 bytes, UTF-8 válido, sem espaço nem controle).
func validEmoji(emoji string) bool {
	if emoji == "" || len(emoji) > 32 || !utf8.ValidString(emoji) {
		return false
	}
	for _, r := range emoji {
		if unicode.IsSpace(r) || unicode.IsControl(r) {
			return false
		}
	}
	return true
}

// AddComment grava o comentário e avisa quem foi marcado (mentionIDs vêm do
// autocomplete; descartamos o que não existe, é o próprio autor ou tem bloqueio).
func (s *Service) AddComment(ctx context.Context, proposalID, authorID, body string, mentionIDs []string, replyToID *string, attachmentIDs []string) (*Comment, error) {
	body, err := cleanComment(body, len(attachmentIDs) > 0)
	if err != nil {
		return nil, err
	}
	if len(mentionIDs) > MaxMentionsPerComment {
		return nil, ErrInvalidComment
	}
	if len(attachmentIDs) > MaxCommentAttachments {
		return nil, ErrInvalidAttachment
	}
	seen := make(map[string]bool, len(attachmentIDs))
	for _, id := range attachmentIDs {
		if seen[id] {
			return nil, ErrInvalidAttachment
		}
		seen[id] = true
	}
	p, err := s.store.Get(ctx, proposalID, nil)
	if err != nil {
		return nil, err
	}
	recent, err := s.store.CountRecentComments(ctx, authorID, s.now().Add(-time.Minute))
	if err != nil {
		return nil, err
	}
	if recent >= CommentsPerMinute {
		return nil, ErrRateLimited
	}
	targets, err := s.store.MentionableUsers(ctx, authorID, mentionIDs)
	if err != nil {
		return nil, err
	}
	id, err := s.store.CreateComment(ctx, proposalID, authorID, body, targets, replyToID, attachmentIDs)
	if err != nil {
		return nil, err
	}
	c, err := s.store.GetComment(ctx, id)
	if err != nil {
		return nil, err
	}
	s.broadcast("proposal:comment_create", c)
	s.publish("proposal:update", proposalID)
	for _, uid := range targets {
		s.sendToUser(uid, "proposal:mention", PendingMention{
			ProposalID:    proposalID,
			CommentID:     c.ID,
			ProposalTitle: p.Title,
			AuthorName:    c.AuthorName,
			Snippet:       snippet(c.Body),
			CreatedAt:     c.CreatedAt,
		})
	}
	return c, nil
}

// EditComment: só o autor do comentário edita. Menções não mudam nem avisam de novo.
func (s *Service) EditComment(ctx context.Context, proposalID, commentID, userID, body string) (*Comment, error) {
	c, err := s.commentOf(ctx, proposalID, commentID)
	if err != nil {
		return nil, err
	}
	if c.AuthorID != userID {
		return nil, ErrForbidden
	}
	body, err = cleanComment(body, len(c.Attachments) > 0)
	if err != nil {
		return nil, err
	}
	if err := s.store.UpdateComment(ctx, commentID, body); err != nil {
		return nil, err
	}
	updated, err := s.store.GetComment(ctx, commentID)
	if err != nil {
		return nil, err
	}
	s.broadcast("proposal:comment_update", updated)
	return updated, nil
}

// DeleteComment: o autor do comentário ou o time tech.
func (s *Service) DeleteComment(ctx context.Context, proposalID, commentID, userID string) error {
	c, err := s.commentOf(ctx, proposalID, commentID)
	if err != nil {
		return err
	}
	if c.AuthorID != userID && !s.IsTech(userID) {
		return ErrForbidden
	}
	attachments, err := s.store.CommentAttachmentIDs(ctx, commentID)
	if err != nil {
		return err
	}
	if err := s.store.DeleteComment(ctx, commentID); err != nil {
		return err
	}
	s.removeFiles(attachments)
	s.broadcast("proposal:comment_delete", map[string]string{"id": commentID, "proposal_id": proposalID})
	s.publish("proposal:update", proposalID)
	return nil
}

// commentOf devolve o comentário se ele é mesmo da proposta da rota.
func (s *Service) commentOf(ctx context.Context, proposalID, commentID string) (*Comment, error) {
	c, err := s.store.GetComment(ctx, commentID)
	if err != nil {
		return nil, err
	}
	if c.ProposalID != proposalID {
		return nil, ErrCommentNotFound
	}
	return c, nil
}

// React põe a reação de userID no comentário (idempotente) e avisa todo mundo
// com o comentário atualizado.
func (s *Service) React(ctx context.Context, proposalID, commentID, userID, emoji string) (*Comment, error) {
	if !validEmoji(emoji) {
		return nil, ErrInvalidEmoji
	}
	if _, err := s.commentOf(ctx, proposalID, commentID); err != nil {
		return nil, err
	}
	if err := s.store.AddCommentReaction(ctx, commentID, userID, emoji); err != nil {
		return nil, err
	}
	return s.publishComment(ctx, commentID)
}

// Unreact tira a reação de userID (idempotente).
func (s *Service) Unreact(ctx context.Context, proposalID, commentID, userID, emoji string) (*Comment, error) {
	if !validEmoji(emoji) {
		return nil, ErrInvalidEmoji
	}
	if _, err := s.commentOf(ctx, proposalID, commentID); err != nil {
		return nil, err
	}
	if err := s.store.RemoveCommentReaction(ctx, commentID, userID, emoji); err != nil {
		return nil, err
	}
	return s.publishComment(ctx, commentID)
}

func (s *Service) publishComment(ctx context.Context, commentID string) (*Comment, error) {
	c, err := s.store.GetComment(ctx, commentID)
	if err != nil {
		return nil, err
	}
	s.broadcast("proposal:comment_update", c)
	return c, nil
}

// RegisterCommentAttachment guarda o anexo pendente de quem enviou.
func (s *Service) RegisterCommentAttachment(ctx context.Context, a CommentAttachmentRow) (CommentAttachment, error) {
	if err := s.store.CreateCommentAttachment(ctx, a); err != nil {
		return CommentAttachment{}, err
	}
	return CommentAttachment{
		ID: a.ID, Kind: a.Kind, ContentType: a.ContentType, Filename: a.Filename,
		SizeBytes: a.SizeBytes, Width: a.Width, Height: a.Height, DurationMs: a.DurationMs,
		URL: commentMediaURL(a.ID),
	}, nil
}

// CommentAttachmentMeta: o tipo guardado do anexo (para servir o arquivo).
func (s *Service) CommentAttachmentMeta(ctx context.Context, id string) (kind, contentType string, err error) {
	return s.store.CommentAttachmentMeta(ctx, id)
}

// PendingMentions lista as menções que a pessoa ainda não viu.
func (s *Service) PendingMentions(ctx context.Context, userID string) ([]PendingMention, error) {
	return s.store.UnseenMentions(ctx, userID)
}

// MarkMentionsSeen: de uma proposta, ou de todas quando proposalID é nulo.
func (s *Service) MarkMentionsSeen(ctx context.Context, userID string, proposalID *string) error {
	return s.store.MarkMentionsSeen(ctx, userID, proposalID)
}

// snippet resume o corpo do comentário para a notificação.
func snippet(body string) string {
	const max = 100
	body = strings.Join(strings.Fields(body), " ")
	if utf8.RuneCountInString(body) <= max {
		return body
	}
	return string([]rune(body)[:max]) + "…"
}
