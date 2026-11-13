package message

import "context"

// noticeKindDisappearing é o system_kind do aviso de troca de prazo (o mesmo das conversas).
const noticeKindDisappearing = "disappearing"

// PostChannelNotice grava o aviso de troca do prazo das mensagens temporárias no
// canal. É a ponta de channel.ChannelNoticePoster (channel não importa message).
func (s *Service) PostChannelNotice(ctx context.Context, channelID, authorID, content string) error {
	_, err := s.CreateSystemChannelMessage(ctx, channelID, authorID, content, noticeKindDisappearing)
	return err
}
