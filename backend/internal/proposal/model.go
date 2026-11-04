package proposal

import (
	"strings"
	"time"
)

// Por que a votação acabou (proposals.close_reason).
const (
	CloseManual   = "manual"   // o time tech moveu o card antes do prazo
	CloseDeadline = "deadline" // o prazo de 7 dias venceu
)

const (
	StatusVoting     = "voting"
	StatusProposed   = "proposed"
	StatusInProgress = "in_progress"
	StatusDone       = "done"
	StatusRejected   = "rejected"
)

// VotingDuration é quanto tempo uma proposta fica em votação.
const VotingDuration = 7 * 24 * time.Hour

// MaxOpenPerUser limita as propostas em votação ao mesmo tempo por pessoa.
const MaxOpenPerUser = 3

const (
	MaxTitleLen       = 120
	MaxDescriptionLen = 2000
	MaxCommentLen     = 1000

	MaxImagesPerProposal  = 4
	MaxMentionsPerComment = 10
	// MaxImageBytes é o limite de cada imagem anexada (o app usa o mesmo número).
	MaxImageBytes int64 = 8 << 20
	// PendingImageTTL: quanto tempo uma imagem enviada pode ficar sem card.
	PendingImageTTL = 24 * time.Hour
	// CommentsPerMinute limita o spam de comentários por pessoa.
	CommentsPerMinute = 10

	// MaxCommentAttachments é quantos arquivos cabem num comentário (como no chat).
	MaxCommentAttachments = 10
	// MaxReactionEmojisPerComment limita os emojis diferentes num comentário.
	MaxReactionEmojisPerComment = 20
)

// ImagesDir é a subpasta dos uploads onde ficam as imagens das propostas, fora
// da raiz que a limpeza dos anexos do chat varre.
const ImagesDir = "proposals"

const imagePath = "/api/proposal-media/"

// Image é uma imagem anexada a uma proposta.
type Image struct {
	ID          string `json:"id"`
	URL         string `json:"url"`
	ContentType string `json:"content_type"`
}

func imageURL(id string) string { return imagePath + id }

// Os anexos dos comentários ficam na mesma pasta de uploads, mas têm rota
// própria (aceitam vídeo e áudio, e o tipo é conferido contra o do banco).
const commentMediaPath = "/api/proposal-comment-media/"

func commentMediaURL(id string) string { return commentMediaPath + id }

// CommentAttachment é um arquivo anexado a um comentário (imagem, vídeo ou áudio).
type CommentAttachment struct {
	ID          string `json:"id"`
	Kind        string `json:"kind"`
	ContentType string `json:"content_type"`
	Filename    string `json:"filename"`
	SizeBytes   int64  `json:"size_bytes"`
	Width       *int   `json:"width,omitempty"`
	Height      *int   `json:"height,omitempty"`
	DurationMs  *int   `json:"duration_ms,omitempty"`
	URL         string `json:"url"`
}

// CommentAttachmentRow é o anexo recém-enviado, ainda pendente (entrada do repositório).
type CommentAttachmentRow struct {
	ID          string
	UploaderID  string
	Kind        string
	ContentType string
	Filename    string
	SizeBytes   int64
	Width       *int
	Height      *int
	DurationMs  *int
}

// ReactionSummary agrupa as reações de um emoji num comentário.
type ReactionSummary struct {
	Emoji   string   `json:"emoji"`
	Count   int      `json:"count"`
	UserIDs []string `json:"user_ids"`
}

// CommentReply é a prévia do comentário a que outro responde.
type CommentReply struct {
	ID         string `json:"id"`
	AuthorID   string `json:"author_id"`
	AuthorName string `json:"author_name"`
	Body       string `json:"body"`
}

// Mention é uma pessoa marcada num comentário.
type Mention struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}

// Comment é um comentário de um card.
type Comment struct {
	ID              string     `json:"id"`
	ProposalID      string     `json:"proposal_id"`
	AuthorID        string     `json:"author_id"`
	AuthorName      string     `json:"author_name"`
	AuthorAvatarURL *string    `json:"author_avatar_url,omitempty"`
	Body            string     `json:"body"`
	CreatedAt       time.Time  `json:"created_at"`
	EditedAt        *time.Time `json:"edited_at,omitempty"`
	Mentions        []Mention  `json:"mentions"`
	// ReplyToID/ReplyTo: o comentário respondido; ReplyTo some se ele foi apagado.
	ReplyToID   *string             `json:"reply_to_id,omitempty"`
	ReplyTo     *CommentReply       `json:"reply_to,omitempty"`
	Reactions   []ReactionSummary   `json:"reactions"`
	Attachments []CommentAttachment `json:"attachments"`
}

// PendingMention é uma menção ainda não vista (GET /proposals/mentions).
type PendingMention struct {
	ProposalID    string    `json:"proposal_id"`
	CommentID     string    `json:"comment_id"`
	ProposalTitle string    `json:"proposal_title"`
	AuthorName    string    `json:"author_name"`
	Snippet       string    `json:"snippet"`
	CreatedAt     time.Time `json:"created_at"`
}

// UserRef é quem do time está com o card.
type UserRef struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	AvatarURL *string `json:"avatar_url,omitempty"`
}

// Proposal é um card do quadro.
type Proposal struct {
	ID              string     `json:"id"`
	AuthorID        string     `json:"author_id"`
	AuthorName      string     `json:"author_name"`
	AuthorAvatarURL *string    `json:"author_avatar_url,omitempty"`
	Title           string     `json:"title"`
	Description     string     `json:"description"`
	Status          string     `json:"status"`
	CreatedAt       time.Time  `json:"created_at"`
	VotingEndsAt    time.Time  `json:"voting_ends_at"`
	ClosedAt        *time.Time `json:"closed_at,omitempty"`
	// ArchivedAt: quando o time tech arquivou o card (some do quadro, nada é apagado).
	ArchivedAt *time.Time `json:"archived_at,omitempty"`
	// MovedAt: quando o card entrou na coluna atual (ordena as colunas).
	MovedAt time.Time `json:"moved_at"`
	// CloseReason e ClosedByName: como a votação acabou e, se foi o time tech, quem.
	CloseReason       *string    `json:"close_reason,omitempty"`
	ClosedByName      *string    `json:"closed_by_name,omitempty"`
	EditedAt          *time.Time `json:"edited_at,omitempty"`
	GithubIssueNumber *int       `json:"github_issue_number,omitempty"`
	GithubIssueURL    *string    `json:"github_issue_url,omitempty"`
	YesVotes          int        `json:"yes_votes"`
	NoVotes           int        `json:"no_votes"`
	CommentCount      int        `json:"comment_count"`
	Images            []Image    `json:"images"`
	// Assignee: quem do time tech está com o card (quem o moveu por último,
	// menos quem só arrastou para Concluída).
	Assignee *UserRef `json:"assignee,omitempty"`
	// MyVote: true = sim, false = não, nulo = ainda não votou. Preenchido só
	// nas respostas para a própria pessoa (não vai no evento de tempo real).
	MyVote *bool `json:"my_vote,omitempty"`

	// Sincronização com a issue (não vai para o app): o que já foi aplicado
	// nela e o usuário do GitHub de quem está com o card.
	IssueState     *string `json:"-"`
	IssueAssignee  *string `json:"-"`
	AssigneeGithub *string `json:"-"`

	// Comments: a discussão do card, preenchida só ao abrir a issue (vai no corpo dela).
	Comments []Comment `json:"-"`
}

// Estados da issue no GitHub (proposals.github_issue_state).
const (
	IssueOpen       = "open"
	IssueCompleted  = "closed:completed"
	IssueNotPlanned = "closed:not_planned"
)

// WantedIssueState: a issue acompanha o card (Concluída fecha como concluída,
// Rejeitada como "não planejada", o resto fica aberta).
func (p Proposal) WantedIssueState() string {
	switch p.Status {
	case StatusDone:
		return IssueCompleted
	case StatusRejected:
		return IssueNotPlanned
	}
	return IssueOpen
}

// IssueInSync: a issue já está como o card pede (estado e assignee).
func (p Proposal) IssueInSync() bool {
	if p.GithubIssueNumber == nil {
		return true
	}
	return p.IssueState != nil && *p.IssueState == p.WantedIssueState() &&
		sameLogin(p.IssueAssignee, p.AssigneeGithub)
}

func sameLogin(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return strings.EqualFold(*a, *b)
}

// Board é a resposta de GET /proposals.
type Board struct {
	Proposals []Proposal `json:"proposals"`
	// IsTech: a pessoa pode mover os cards do time tech.
	IsTech bool `json:"is_tech"`
	// GithubUsername: o usuário do GitHub de quem é do time (vira o assignee da issue).
	GithubUsername *string `json:"github_username,omitempty"`
}

// Approved: o sim precisa ganhar do não (empate e zero voto rejeitam).
func (p Proposal) Approved() bool { return p.YesVotes > p.NoVotes }

// IsOpen diz se ainda dá para votar.
func (p Proposal) IsOpen(now time.Time) bool {
	return p.Status == StatusVoting && now.Before(p.VotingEndsAt)
}
