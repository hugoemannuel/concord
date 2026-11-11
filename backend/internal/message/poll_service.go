package message

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

func (s *Service) CreateChannelPoll(ctx context.Context, channelID string, authorID string, input CreatePollInput) (*Message, error) {
	// A enquete é mensagem do canal: gasta a vez do modo lento como as outras.
	msg, err := s.slowmode.Run(ctx, channelID, authorID, func() (*Message, error) {
		return s.createPoll(ctx, channelID, "", authorID, input)
	})
	if err != nil {
		return nil, err
	}

	serverID := ""
	if s.channelResolver != nil {
		serverID, _ = s.channelResolver.ChannelServerID(ctx, channelID)
	}

	s.publisher.PublishMessageCreate(CreateEvent{
		ChannelID: msg.ChannelID,
		ServerID:  serverID,
		Message:   *msg,
	})

	return msg, nil
}

func (s *Service) CreateConversationPoll(ctx context.Context, conversationID string, authorID string, input CreatePollInput) (*Message, error) {
	msg, err := s.createPoll(ctx, "", conversationID, authorID, input)
	if err != nil {
		return nil, err
	}

	var userIDs []string
	if s.convResolver != nil {
		userIDs, _ = s.convResolver.ConversationParticipantIDs(ctx, conversationID)
	}

	s.publisher.PublishMessageCreate(CreateEvent{
		ConversationID: msg.ConversationID,
		UserIDs:        userIDs,
		Message:        *msg,
	})

	return msg, nil
}

func (s *Service) createPoll(ctx context.Context, channelID string, conversationID string, authorID string, input CreatePollInput) (*Message, error) {
	poll, err := buildPoll(input, time.Now())
	if err != nil {
		return nil, err
	}

	msg := &Message{
		ID:             uuid.New().String(),
		AuthorID:       authorID,
		ChannelID:      &channelID,
		ConversationID: &conversationID,
	}
	if channelID == "" {
		msg.ChannelID = nil
	}
	if conversationID == "" {
		msg.ConversationID = nil
	}

	if err := s.repository.CreateWithPoll(ctx, msg, poll); err != nil {
		return nil, err
	}

	full, err := s.repository.FindByID(ctx, msg.ID)
	if err != nil {
		return nil, err
	}
	full.Poll, err = s.repository.FindPoll(ctx, msg.ID, authorID)
	if err != nil {
		return nil, err
	}

	return full, nil
}

func (s *Service) VoteChannelPoll(ctx context.Context, channelID string, messageID string, userID string, answerIDs []int) (*Poll, error) {
	return s.vote(ctx, &channelID, nil, messageID, userID, answerIDs)
}

func (s *Service) VoteConversationPoll(ctx context.Context, conversationID string, messageID string, userID string, answerIDs []int) (*Poll, error) {
	return s.vote(ctx, nil, &conversationID, messageID, userID, answerIDs)
}

func (s *Service) EndChannelPoll(ctx context.Context, channelID string, messageID string, userID string) (*Poll, error) {
	return s.end(ctx, &channelID, nil, messageID, userID)
}

func (s *Service) EndConversationPoll(ctx context.Context, conversationID string, messageID string, userID string) (*Poll, error) {
	return s.end(ctx, nil, &conversationID, messageID, userID)
}

func (s *Service) vote(ctx context.Context, channelID *string, conversationID *string, messageID string, userID string, answerIDs []int) (*Poll, error) {
	msg, err := s.findInRoom(ctx, channelID, conversationID, messageID)
	if err != nil {
		return nil, err
	}

	poll, err := s.repository.FindPoll(ctx, messageID, userID)
	if err != nil {
		return nil, err
	}
	if err := validateVote(poll, answerIDs, time.Now()); err != nil {
		return nil, err
	}

	if answerIDs == nil {
		answerIDs = []int{}
	}
	if err := s.repository.SetVotes(ctx, messageID, userID, answerIDs); err != nil {
		return nil, err
	}

	return s.publishPollUpdate(ctx, msg, userID, answerIDs)
}

func (s *Service) end(ctx context.Context, channelID *string, conversationID *string, messageID string, userID string) (*Poll, error) {
	msg, err := s.findInRoom(ctx, channelID, conversationID, messageID)
	if err != nil {
		return nil, err
	}
	if channelID != nil {
		if err := s.canModerate(ctx, *channelID, msg.AuthorID, userID); errors.Is(err, ErrNotAuthor) {
			return nil, ErrNotPollAuthor
		} else if err != nil {
			return nil, ErrPollNotFound
		}
	} else if msg.AuthorID != userID {
		return nil, ErrNotPollAuthor
	}

	if err := s.repository.EndPoll(ctx, messageID); err != nil {
		return nil, err
	}

	return s.publishPollUpdate(ctx, msg, "", nil)
}

// findInRoom busca a mensagem e confere que ela é do canal/conversa da rota.
func (s *Service) findInRoom(ctx context.Context, channelID *string, conversationID *string, messageID string) (*Message, error) {
	msg, err := s.repository.FindByID(ctx, messageID)
	if err != nil {
		return nil, ErrPollNotFound
	}
	if channelID != nil && (msg.ChannelID == nil || *msg.ChannelID != *channelID) {
		return nil, ErrPollNotFound
	}
	if conversationID != nil && (msg.ConversationID == nil || *msg.ConversationID != *conversationID) {
		return nil, ErrPollNotFound
	}
	return msg, nil
}

// publishPollUpdate avisa a sala das novas contagens e devolve a enquete vista
// por viewerID (quem votou ou encerrou).
func (s *Service) publishPollUpdate(ctx context.Context, msg *Message, voterID string, voterAnswerIDs []int) (*Poll, error) {
	shared, err := s.repository.FindPoll(ctx, msg.ID, "")
	if err != nil {
		return nil, err
	}

	s.publisher.PublishPollUpdate(PollUpdateEvent{
		ChannelID:      msg.ChannelID,
		ConversationID: msg.ConversationID,
		MessageID:      msg.ID,
		Poll:           *shared,
		VoterID:        voterID,
		VoterAnswerIDs: voterAnswerIDs,
	})

	viewerID := voterID
	if viewerID == "" {
		viewerID = msg.AuthorID
	}
	return s.repository.FindPoll(ctx, msg.ID, viewerID)
}
