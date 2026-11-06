package proposal

import (
	"context"
	"errors"
	"log"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"gin-quickstart/backend/internal/platform/wsevent"
)

var (
	ErrInvalidTitle       = errors.New("invalid title")
	ErrInvalidDescription = errors.New("invalid description")
	ErrInvalidImage       = errors.New("invalid image")
	ErrInvalidComment     = errors.New("invalid comment")
	ErrTooManyOpen        = errors.New("too many open proposals")
	ErrVotingClosed       = errors.New("voting closed")
	ErrForbidden          = errors.New("forbidden")
	ErrInvalidStatus      = errors.New("invalid status")
	ErrCommentNotFound    = errors.New("comment not found")
	ErrRateLimited        = errors.New("too many comments")
	ErrInvalidReply       = errors.New("invalid reply")
	ErrInvalidAttachment  = errors.New("invalid attachment")
	ErrInvalidEmoji       = errors.New("invalid emoji")
	ErrTooManyReactions   = errors.New("too many different reactions")
	ErrAssigneeConflict   = errors.New("assigned to another dev")
	ErrInvalidGithubLogin = errors.New("invalid github username")
)

// AssigneeConflictError: o card está com outro dev; mover tira dele (o app
// confirma e manda de novo com take_over).
type AssigneeConflictError struct{ AssigneeName string }

func (e *AssigneeConflictError) Error() string { return "assigned to " + e.AssigneeName }

func (e *AssigneeConflictError) Is(target error) bool { return target == ErrAssigneeConflict }

// StatusNotifier manda a mensagem do Salinha Bot na DM de userID.
type StatusNotifier interface {
	Notify(ctx context.Context, userID, text string) error
}

// nextAssignee decide quem fica com o card quando mover vai para status:
// arrastar para Concluída mantém quem estava (pode ser só o deploy do colega);
// qualquer outro movimento passa para quem moveu, e tirar de outro dev pede
// confirmação (takeOver).
func nextAssignee(current *UserRef, mover, status string, takeOver bool) (string, error) {
	if current == nil || current.ID == mover {
		return mover, nil
	}
	if status == StatusDone {
		return current.ID, nil
	}
	if !takeOver {
		return "", &AssigneeConflictError{AssigneeName: current.Name}
	}
	return mover, nil
}

// githubLogin: o formato de usuário do GitHub (1–39, letras, números e hífen
// no meio).
var githubLogin = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9]|-[A-Za-z0-9]){0,38}$`)

// Intervalo do fechamento das votações e das novas tentativas de issue.
const tickInterval = time.Minute

type store interface {
	List(ctx context.Context, viewerID string) ([]Proposal, error)
	Get(ctx context.Context, id string, viewerID *string) (*Proposal, error)
	CreateWithLimit(ctx context.Context, authorID, title, description string, endsAt, now time.Time, max int, imageIDs []string) (string, error)
	Update(ctx context.Context, id, editorID, title, description string, imageIDs []string) (removedImages []string, err error)
	UpsertVote(ctx context.Context, id, userID string, approve bool, now time.Time) (bool, error)
	DeleteVote(ctx context.Context, id, userID string, now time.Time) (bool, error)
	Delete(ctx context.Context, id string) error
	SetStatus(ctx context.Context, id, userID, status, assigneeID string) error
	Archive(ctx context.Context, ids []string) ([]string, error)
	ArchiveByStatus(ctx context.Context, status string) ([]string, error)
	Unarchive(ctx context.Context, id string) (bool, error)
	ListArchived(ctx context.Context, viewerID, query string, limit, offset int) ([]Proposal, bool, error)
	CloseDue(ctx context.Context, now time.Time) ([]string, error)
	WithoutIssue(ctx context.Context) ([]Proposal, error)
	SetIssue(ctx context.Context, id string, number int, url string) error
	NeedingIssueSync(ctx context.Context) ([]Proposal, error)
	SetIssueSynced(ctx context.Context, id, state string, assignee *string) error
	GithubUsername(ctx context.Context, userID string) (*string, error)
	SetGithubUsername(ctx context.Context, userID string, login *string) error

	CreateImage(ctx context.Context, id, uploaderID, contentType string, size int64) error
	ImageIDs(ctx context.Context, proposalID string) ([]string, error)
	ImageContentType(ctx context.Context, id string) (string, error)
	DeletePendingImages(ctx context.Context, cutoff time.Time) ([]string, error)

	ListComments(ctx context.Context, proposalID string) ([]Comment, error)
	GetComment(ctx context.Context, id string) (*Comment, error)
	CreateComment(ctx context.Context, proposalID, authorID, body string, mentionIDs []string, replyToID *string, attachmentIDs []string) (string, error)
	UpdateComment(ctx context.Context, id, body string) error
	DeleteComment(ctx context.Context, id string) error
	CountRecentComments(ctx context.Context, authorID string, since time.Time) (int, error)

	AddCommentReaction(ctx context.Context, commentID, userID, emoji string) error
	RemoveCommentReaction(ctx context.Context, commentID, userID, emoji string) error

	CreateCommentAttachment(ctx context.Context, a CommentAttachmentRow) error
	CommentAttachmentMeta(ctx context.Context, id string) (kind, contentType string, err error)
	CommentAttachmentIDs(ctx context.Context, commentID string) ([]string, error)
	ProposalCommentAttachmentIDs(ctx context.Context, proposalID string) ([]string, error)
	DeletePendingCommentAttachments(ctx context.Context, cutoff time.Time) ([]string, error)

	MentionableUsers(ctx context.Context, authorID string, ids []string) ([]string, error)
	UnseenMentions(ctx context.Context, userID string) ([]PendingMention, error)
	MarkMentionsSeen(ctx context.Context, userID string, proposalID *string) error
}

type EventPublisher interface {
	BroadcastAll(event []byte)
	SendToUser(userID string, event []byte)
}

// fileRemover apaga o arquivo de uma imagem (media.Store).
type fileRemover interface {
	Remove(name string) error
}

// BadgeRefresher reavalia os badges de alguém na hora (badge.Service): card
// novo sobe o Contribuinte, voto sobe o Votante, e sai o aviso de desbloqueio.
type BadgeRefresher interface {
	Refresh(ctx context.Context, userID string)
}

type Service struct {
	store     store
	publisher EventPublisher
	issues    IssueCreator   // nil: sem token do GitHub, não cria issue
	files     fileRemover    // nil: não apaga arquivos (testes)
	notifier  StatusNotifier // nil: o Salinha Bot não avisa
	badges    BadgeRefresher // nil: o badge sobe na próxima varredura
	tech      map[string]bool
	now       func() time.Time
	// githubBlockedLogged: até quando já foi logado o limite da API (loga uma vez).
	githubBlockedLogged time.Time
}

// WithNotifier liga os avisos do Salinha Bot na DM de quem sugeriu.
func (s *Service) WithNotifier(n StatusNotifier) *Service {
	s.notifier = n
	return s
}

// WithBadges liga a reavaliação dos badges de quem cria um card.
func (s *Service) WithBadges(b BadgeRefresher) *Service {
	s.badges = b
	return s
}

// ProposalService: techIDs são os usuários do time tech (TECH_TEAM_USER_IDS).
// files apaga os arquivos das imagens quando elas saem do banco.
func ProposalService(repository *Repository, publisher EventPublisher, issues IssueCreator, files fileRemover, techIDs []string) *Service {
	s := newService(repository, publisher, issues, techIDs)
	s.files = files
	return s
}

func newService(st store, publisher EventPublisher, issues IssueCreator, techIDs []string) *Service {
	tech := make(map[string]bool, len(techIDs))
	for _, id := range techIDs {
		tech[id] = true
	}
	return &Service{store: st, publisher: publisher, issues: issues, tech: tech, now: time.Now}
}

func (s *Service) IsTech(userID string) bool { return s.tech[userID] }

func (s *Service) Board(ctx context.Context, userID string) (*Board, error) {
	list, err := s.store.List(ctx, userID)
	if err != nil {
		return nil, err
	}
	board := &Board{Proposals: list, IsTech: s.IsTech(userID)}
	if board.IsTech {
		if board.GithubUsername, err = s.store.GithubUsername(ctx, userID); err != nil {
			return nil, err
		}
	}
	return board, nil
}

// SetGithubUsername guarda o usuário do GitHub de quem é do time tech ("" apaga).
// Os cards com ele passam a ter o assignee certo na próxima sincronização.
func (s *Service) SetGithubUsername(ctx context.Context, userID, login string) (*string, error) {
	if !s.IsTech(userID) {
		return nil, ErrForbidden
	}
	login = strings.TrimPrefix(strings.TrimSpace(login), "@")
	var value *string
	if login != "" {
		if !githubLogin.MatchString(login) {
			return nil, ErrInvalidGithubLogin
		}
		value = &login
	}
	if err := s.store.SetGithubUsername(ctx, userID, value); err != nil {
		return nil, err
	}
	return value, nil
}

// validateContent confere título, descrição e a quantidade de imagens.
func validateContent(title, description string, imageIDs []string) (string, string, error) {
	title = strings.TrimSpace(title)
	description = strings.TrimSpace(description)
	if n := utf8.RuneCountInString(title); n < 3 || n > MaxTitleLen {
		return "", "", ErrInvalidTitle
	}
	if utf8.RuneCountInString(description) > MaxDescriptionLen {
		return "", "", ErrInvalidDescription
	}
	if len(imageIDs) > MaxImagesPerProposal {
		return "", "", ErrInvalidImage
	}
	seen := make(map[string]bool, len(imageIDs))
	for _, id := range imageIDs {
		if seen[id] {
			return "", "", ErrInvalidImage
		}
		seen[id] = true
	}
	return title, description, nil
}

func (s *Service) Create(ctx context.Context, authorID, title, description string, imageIDs []string) (*Proposal, error) {
	title, description, err := validateContent(title, description, imageIDs)
	if err != nil {
		return nil, err
	}

	now := s.now()
	id, err := s.store.CreateWithLimit(ctx, authorID, title, description, now.Add(VotingDuration), now, MaxOpenPerUser, imageIDs)
	if err != nil {
		return nil, err
	}
	p, err := s.store.Get(ctx, id, &authorID)
	if err != nil {
		return nil, err
	}
	s.publish("proposal:create", id)
	if s.badges != nil {
		s.badges.Refresh(ctx, authorID)
	}
	return p, nil
}

// Update edita título, descrição e imagens: o time tech a qualquer hora, o
// autor só enquanto a votação está aberta.
func (s *Service) Update(ctx context.Context, id, userID, title, description string, imageIDs []string) (*Proposal, error) {
	p, err := s.store.Get(ctx, id, nil)
	if err != nil {
		return nil, err
	}
	if !s.IsTech(userID) && (p.AuthorID != userID || !p.IsOpen(s.now())) {
		return nil, ErrForbidden
	}
	title, description, err = validateContent(title, description, imageIDs)
	if err != nil {
		return nil, err
	}
	removed, err := s.store.Update(ctx, id, userID, title, description, imageIDs)
	if err != nil {
		return nil, err
	}
	s.removeFiles(removed)
	s.publish("proposal:update", id)
	return s.store.Get(ctx, id, &userID)
}

// Delete: o autor remove enquanto está em votação; o time tech, a qualquer hora.
func (s *Service) Delete(ctx context.Context, id, userID string) error {
	p, err := s.store.Get(ctx, id, nil)
	if err != nil {
		return err
	}
	if !s.IsTech(userID) && (p.AuthorID != userID || p.Status != StatusVoting) {
		return ErrForbidden
	}
	images, err := s.store.ImageIDs(ctx, id)
	if err != nil {
		return err
	}
	attachments, err := s.store.ProposalCommentAttachmentIDs(ctx, id)
	if err != nil {
		return err
	}
	if err := s.store.Delete(ctx, id); err != nil {
		return err
	}
	s.removeFiles(images)
	s.removeFiles(attachments)
	s.publish("proposal:delete", id)
	return nil
}

// validStatus: os status para onde o time tech pode mover um card. "voting"
// fica de fora: a votação só começa na criação e acaba no fechamento.
var validStatus = map[string]bool{
	StatusProposed:   true,
	StatusInProgress: true,
	StatusDone:       true,
	StatusRejected:   true,
}

// SetStatus move o card para qualquer coluna, a qualquer hora (só o time tech),
// e decide quem fica com ele (nextAssignee). Indo para uma coluna aprovada, a
// issue do GitHub sai na hora; a issue acompanha o card (fecha, reabre,
// assignee) e o Salinha Bot avisa quem sugeriu.
func (s *Service) SetStatus(ctx context.Context, id, userID, status string, takeOver bool) (*Proposal, error) {
	if !s.IsTech(userID) {
		return nil, ErrForbidden
	}
	if !validStatus[status] {
		return nil, ErrInvalidStatus
	}
	before, err := s.store.Get(ctx, id, nil)
	if err != nil {
		return nil, err
	}
	if before.ArchivedAt != nil {
		return nil, ErrArchived
	}
	if before.Status == status {
		return nil, ErrInvalidStatus
	}
	assignee, err := nextAssignee(before.Assignee, userID, status, takeOver)
	if err != nil {
		return nil, err
	}
	if err := s.store.SetStatus(ctx, id, userID, status, assignee); err != nil {
		return nil, err
	}
	if moved, err := s.store.Get(ctx, id, nil); err == nil {
		if status != StatusRejected {
			s.ensureIssue(ctx, *moved)
		}
		s.syncIssue(ctx, id)
		if moved.AuthorID != userID {
			s.notifyStatus(ctx, *before, *moved)
		}
	}
	s.publish("proposal:update", id)
	return s.store.Get(ctx, id, &userID)
}

// notifyStatus manda o aviso do Salinha Bot (falha só é registrada: o card já mudou).
func (s *Service) notifyStatus(ctx context.Context, before, after Proposal) {
	if s.notifier == nil {
		return
	}
	text := statusMessage(before, after)
	if text == "" {
		return
	}
	if err := s.notifier.Notify(ctx, after.AuthorID, text); err != nil {
		log.Printf("[proposal] aviso do bot para %s: %v", after.AuthorID, err)
	}
}

// Run fecha as votações vencidas e cria as issues que faltam até ctx acabar.
func (s *Service) Run(ctx context.Context) {
	ticker := time.NewTicker(tickInterval)
	defer ticker.Stop()
	for {
		s.Tick(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *Service) Tick(ctx context.Context) {
	ids, err := s.store.CloseDue(ctx, s.now())
	if err != nil {
		log.Printf("[proposal] close due: %v", err)
	}
	for _, id := range ids {
		s.publish("proposal:update", id)
		if closed, err := s.store.Get(ctx, id, nil); err == nil {
			s.notifyStatus(ctx, Proposal{Status: StatusVoting}, *closed)
		}
	}
	if s.createMissingIssues(ctx) {
		s.syncIssues(ctx)
	}
	s.cleanPendingImages(ctx)
}

// createMissingIssues abre as issues que faltam; false se o limite da API
// acabou (o resto espera o reset, no próximo Tick).
func (s *Service) createMissingIssues(ctx context.Context) bool {
	if s.issues == nil {
		return false
	}
	pending, err := s.store.WithoutIssue(ctx)
	if err != nil {
		log.Printf("[proposal] list without issue: %v", err)
		return true
	}
	for _, p := range pending {
		if !s.ensureIssue(ctx, p) {
			return false
		}
	}
	return true
}

// ensureIssue abre a issue do card se ainda não tem. Falha (sem token ou erro
// do GitHub) só é registrada: o Tick tenta de novo, o card já está movido.
// false = limite da API esgotado (pare a fila).
func (s *Service) ensureIssue(ctx context.Context, p Proposal) bool {
	if s.issues == nil || p.GithubIssueURL != nil {
		return true
	}
	// A discussão do card vai no corpo da issue; sem ela, abre a issue mesmo assim.
	if comments, err := s.store.ListComments(ctx, p.ID); err != nil {
		log.Printf("[proposal] list comments for issue %s: %v", p.ID, err)
	} else {
		p.Comments = comments
	}
	number, url, err := s.issues.CreateIssue(ctx, p)
	if err != nil {
		return s.githubFailed("create issue for "+p.ID, err)
	}
	if err := s.store.SetIssue(ctx, p.ID, number, url); err != nil {
		log.Printf("[proposal] save issue for %s: %v", p.ID, err)
		return true
	}
	s.publish("proposal:update", p.ID)
	return true
}

// githubFailed registra a falha; o limite da API é logado uma vez por bloqueio
// e devolve false (espere o reset).
func (s *Service) githubFailed(what string, err error) bool {
	var limited *RateLimitError
	if errors.As(err, &limited) {
		if !limited.Until.Equal(s.githubBlockedLogged) {
			s.githubBlockedLogged = limited.Until
			log.Printf("[proposal] limite da API do GitHub: continua às %s", limited.Until.Format(time.RFC3339))
		}
		return false
	}
	log.Printf("[proposal] %s: %v", what, err)
	return true
}

// syncIssues deixa as issues como os cards pedem, até o limite da API acabar.
func (s *Service) syncIssues(ctx context.Context) {
	if _, ok := s.issues.(IssueUpdater); !ok {
		return
	}
	pending, err := s.store.NeedingIssueSync(ctx)
	if err != nil {
		log.Printf("[proposal] list issues to sync: %v", err)
		return
	}
	for _, p := range pending {
		if !s.applyIssue(ctx, p) {
			return
		}
	}
}

// syncIssue tenta na hora depois de mover o card (o Tick refaz se falhar).
func (s *Service) syncIssue(ctx context.Context, id string) {
	if _, ok := s.issues.(IssueUpdater); !ok {
		return
	}
	if p, err := s.store.Get(ctx, id, nil); err == nil {
		s.applyIssue(ctx, *p)
	}
}

// applyIssue aplica estado e assignee na issue do card; false = limite da API.
func (s *Service) applyIssue(ctx context.Context, p Proposal) bool {
	updater, ok := s.issues.(IssueUpdater)
	if !ok || p.GithubIssueNumber == nil || p.IssueInSync() {
		return true
	}
	state := p.WantedIssueState()
	applied, err := updater.UpdateIssue(ctx, *p.GithubIssueNumber, state, p.AssigneeGithub)
	if err != nil {
		return s.githubFailed("sync issue for "+p.ID, err)
	}
	if !applied && p.AssigneeGithub != nil {
		// Login recusado pelo GitHub: grava como aplicado para não insistir.
		log.Printf("[proposal] o GitHub recusou %q como assignee da issue #%d", *p.AssigneeGithub, *p.GithubIssueNumber)
	}
	if err := s.store.SetIssueSynced(ctx, p.ID, state, p.AssigneeGithub); err != nil {
		log.Printf("[proposal] save issue sync for %s: %v", p.ID, err)
	}
	return true
}

// cleanPendingImages apaga as imagens enviadas e nunca anexadas a um card.
func (s *Service) cleanPendingImages(ctx context.Context) {
	ids, err := s.store.DeletePendingImages(ctx, s.now().Add(-PendingImageTTL))
	if err != nil {
		log.Printf("[proposal] clean pending images: %v", err)
		return
	}
	s.removeFiles(ids)

	pending, err := s.store.DeletePendingCommentAttachments(ctx, s.now().Add(-PendingImageTTL))
	if err != nil {
		log.Printf("[proposal] clean pending comment attachments: %v", err)
		return
	}
	s.removeFiles(pending)
}

func (s *Service) removeFiles(ids []string) {
	if s.files == nil {
		return
	}
	for _, id := range ids {
		if err := s.files.Remove(id); err != nil {
			log.Printf("[proposal] remove image %s: %v", id, err)
		}
	}
}

// RegisterImage guarda a imagem pendente de quem enviou.
func (s *Service) RegisterImage(ctx context.Context, id, uploaderID, contentType string, size int64) error {
	return s.store.CreateImage(ctx, id, uploaderID, contentType, size)
}

// ImageContentType: o tipo guardado da imagem (para servir o arquivo).
func (s *Service) ImageContentType(ctx context.Context, id string) (string, error) {
	return s.store.ImageContentType(ctx, id)
}

// publish manda o card atualizado a todos (sem my_vote: cada app mantém o seu).
func (s *Service) publish(typ, id string) {
	payload := any(map[string]string{"id": id})
	if typ != "proposal:delete" {
		p, err := s.store.Get(context.Background(), id, nil)
		if err != nil {
			log.Printf("[proposal] publish %s: %v", id, err)
			return
		}
		payload = p
	}
	s.broadcast(typ, payload)
}

func (s *Service) broadcast(typ string, payload any) {
	if data := wsevent.Marshal(typ, payload); data != nil {
		s.publisher.BroadcastAll(data)
	}
}

func (s *Service) sendToUser(userID, typ string, payload any) {
	if data := wsevent.Marshal(typ, payload); data != nil {
		s.publisher.SendToUser(userID, data)
	}
}
