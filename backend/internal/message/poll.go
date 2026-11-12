package message

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

// Limites iguais aos do Discord.
const (
	PollQuestionMaxLength = 300
	PollAnswerMaxLength   = 55
	PollMinAnswers        = 2
	PollMaxAnswers        = 10
	PollEmojiMaxLength    = 16
	PollImageURLMaxLength = 512
	PollDefaultDuration   = 24
)

// PollDurations são as durações (em horas) oferecidas na criação: 1h, 4h, 8h,
// 24h, 3 dias, 1 semana e 2 semanas.
var PollDurations = []int{1, 4, 8, 24, 72, 168, 336}

var (
	ErrPollQuestionRequired = errors.New("poll question is required")
	ErrPollQuestionTooLong  = errors.New("poll question is too long")
	ErrPollAnswerCount      = errors.New("a poll needs between 2 and 10 answers")
	ErrPollAnswerRequired   = errors.New("poll answer text is required")
	ErrPollAnswerTooLong    = errors.New("poll answer text is too long")
	ErrPollEmojiInvalid     = errors.New("poll answer emoji is invalid")
	ErrPollImageInvalid     = errors.New("poll answer image must be an https url")
	ErrPollEmojiAndImage    = errors.New("poll answer can have an emoji or an image, not both")
	ErrPollDurationInvalid  = errors.New("invalid poll duration")
	ErrPollNotFound         = errors.New("poll not found")
	ErrPollClosed           = errors.New("poll has ended")
	ErrPollInvalidVote      = errors.New("invalid poll vote")
	ErrNotPollAuthor        = errors.New("only the author can end this poll")
)

type PollAnswer struct {
	AnswerID int     `json:"answer_id"`
	Text     string  `json:"text"`
	Emoji    *string `json:"emoji,omitempty"`
	ImageURL *string `json:"image_url,omitempty"`
	Count    int     `json:"count"`
	MeVoted  bool    `json:"me_voted"`
}

type Poll struct {
	Question         string       `json:"question"`
	Answers          []PollAnswer `json:"answers"`
	AllowMultiselect bool         `json:"allow_multiselect"`
	ExpiresAt        time.Time    `json:"expires_at"`
	EndedAt          *time.Time   `json:"ended_at,omitempty"`
	TotalVoters      int          `json:"total_voters"`
}

// Closed diz se a enquete não aceita mais votos: encerrada pelo autor ou
// com o prazo vencido.
func (p *Poll) Closed(now time.Time) bool {
	return p.EndedAt != nil || !now.Before(p.ExpiresAt)
}

type PollAnswerInput struct {
	Text     string `json:"text"`
	Emoji    string `json:"emoji"`
	ImageURL string `json:"image_url"`
}

type CreatePollInput struct {
	Question         string            `json:"question"`
	Answers          []PollAnswerInput `json:"answers"`
	DurationHours    int               `json:"duration_hours"`
	AllowMultiselect bool              `json:"allow_multiselect"`
}

type PollUpdateEvent struct {
	ChannelID      *string `json:"channel_id,omitempty"`
	ConversationID *string `json:"conversation_id,omitempty"`
	MessageID      string  `json:"message_id"`
	Poll           Poll    `json:"poll"`
	// Quem votou e o voto atual dessa pessoa, para o cliente dela atualizar
	// "me_voted" (as contagens do evento não dependem de quem recebe).
	VoterID        string `json:"voter_id,omitempty"`
	VoterAnswerIDs []int  `json:"voter_answer_ids"`
}

// buildPoll valida a entrada e devolve a enquete pronta para salvar, com as
// respostas numeradas a partir de 1.
func buildPoll(input CreatePollInput, now time.Time) (*Poll, error) {
	question := strings.TrimSpace(input.Question)
	if question == "" {
		return nil, ErrPollQuestionRequired
	}
	if utf8.RuneCountInString(question) > PollQuestionMaxLength {
		return nil, ErrPollQuestionTooLong
	}

	if len(input.Answers) < PollMinAnswers || len(input.Answers) > PollMaxAnswers {
		return nil, ErrPollAnswerCount
	}

	duration := input.DurationHours
	if duration == 0 {
		duration = PollDefaultDuration
	}
	if !validDuration(duration) {
		return nil, ErrPollDurationInvalid
	}

	answers := make([]PollAnswer, 0, len(input.Answers))
	for i, in := range input.Answers {
		answer, err := buildAnswer(i+1, in)
		if err != nil {
			return nil, err
		}
		answers = append(answers, answer)
	}

	return &Poll{
		Question:         question,
		Answers:          answers,
		AllowMultiselect: input.AllowMultiselect,
		ExpiresAt:        now.Add(time.Duration(duration) * time.Hour),
	}, nil
}

func buildAnswer(id int, in PollAnswerInput) (PollAnswer, error) {
	text := strings.TrimSpace(in.Text)
	if text == "" {
		return PollAnswer{}, ErrPollAnswerRequired
	}
	if utf8.RuneCountInString(text) > PollAnswerMaxLength {
		return PollAnswer{}, ErrPollAnswerTooLong
	}

	answer := PollAnswer{AnswerID: id, Text: text}

	emoji := strings.TrimSpace(in.Emoji)
	imageURL := strings.TrimSpace(in.ImageURL)
	if emoji != "" && imageURL != "" {
		return PollAnswer{}, ErrPollEmojiAndImage
	}
	if emoji != "" {
		if utf8.RuneCountInString(emoji) > PollEmojiMaxLength || strings.ContainsAny(emoji, " \t\n") {
			return PollAnswer{}, ErrPollEmojiInvalid
		}
		answer.Emoji = &emoji
	}
	if imageURL != "" {
		// Só a cópia guardada no servidor (a de fora é trocada antes, em
		// PollImages.Localize): nunca uma URL que o app carregue de fora.
		if !validPollImage(imageURL) {
			return PollAnswer{}, ErrPollImageInvalid
		}
		answer.ImageURL = &imageURL
	}

	return answer, nil
}

func validDuration(hours int) bool {
	for _, d := range PollDurations {
		if d == hours {
			return true
		}
	}
	return false
}

// validateVote confere o voto de alguém: respostas existentes, sem repetir e
// só uma quando a enquete não é de múltipla escolha. Votar em nada remove o
// voto.
func validateVote(poll *Poll, answerIDs []int, now time.Time) error {
	if poll.Closed(now) {
		return ErrPollClosed
	}
	if len(answerIDs) > 1 && !poll.AllowMultiselect {
		return ErrPollInvalidVote
	}

	valid := make(map[int]bool, len(poll.Answers))
	for _, a := range poll.Answers {
		valid[a.AnswerID] = true
	}
	seen := make(map[int]bool, len(answerIDs))
	for _, id := range answerIDs {
		if !valid[id] || seen[id] {
			return ErrPollInvalidVote
		}
		seen[id] = true
	}
	return nil
}
