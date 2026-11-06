package call

// Lista dos canais de voz do servidor em tempo real. Entrar, sair e o fim de
// uma chamada de canal vão também para a sala do servidor, só para quem vê o
// canal (como call:voice e call:live), e o app mantém a lista sem polling.
//
// Nomes próprios (call:channel_*): quem está na chamada já recebe
// call:joined/left/ended pela sala dela e não pode tratar a mesma entrada duas
// vezes (som, selo "Chegou").

// ChannelJoinedEvent: alguém entrou numa chamada de canal. Leva a chamada
// inteira para o app montar a linha do canal que ainda não tinha ninguém.
type ChannelJoinedEvent struct {
	Call        Call            `json:"call"`
	Participant ParticipantInfo `json:"participant"`
}

// ChannelLeftEvent: alguém saiu de uma chamada de canal.
type ChannelLeftEvent struct {
	CallID    string `json:"call_id"`
	ServerID  string `json:"server_id"`
	ChannelID string `json:"channel_id"`
	UserID    string `json:"user_id"`
}

// ChannelEndedEvent: a chamada do canal acabou (o canal ficou vazio).
type ChannelEndedEvent struct {
	CallID    string `json:"call_id"`
	ServerID  string `json:"server_id"`
	ChannelID string `json:"channel_id"`
}

// announceChannelJoined avisa o servidor da entrada. DM não tem lista.
func (s *Service) announceChannelJoined(call Call, participant ParticipantInfo) {
	if call.ServerID == nil || call.ChannelID == nil {
		return
	}
	s.broadcastServer(*call.ServerID, call.ChannelID, marshalEvent("call:channel_joined", ChannelJoinedEvent{
		Call:        call,
		Participant: participant,
	}))
}

// announceChannelLeft avisa o servidor da saída. DM não tem lista.
func (s *Service) announceChannelLeft(serverID string, channelID *string, callID, userID string) {
	if serverID == "" || channelID == nil {
		return
	}
	s.broadcastServer(serverID, channelID, marshalEvent("call:channel_left", ChannelLeftEvent{
		CallID:    callID,
		ServerID:  serverID,
		ChannelID: *channelID,
		UserID:    userID,
	}))
}

// announceChannelEnded avisa o servidor do fim da chamada. DM não tem lista.
func (s *Service) announceChannelEnded(serverID string, channelID *string, callID string) {
	if serverID == "" || channelID == nil {
		return
	}
	s.broadcastServer(serverID, channelID, marshalEvent("call:channel_ended", ChannelEndedEvent{
		CallID:    callID,
		ServerID:  serverID,
		ChannelID: *channelID,
	}))
}
