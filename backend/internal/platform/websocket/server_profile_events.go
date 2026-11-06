package websocket

import (
	"gin-quickstart/backend/internal/platform/wsevent"
	"gin-quickstart/backend/internal/serverprofile"
	"gin-quickstart/backend/internal/user"
)

// PublishServerProfile: quem está no servidor atualiza a faixa, o fundo e o cartão.
func (h *Hub) PublishServerProfile(event serverprofile.ProfileEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, wsevent.Marshal("server:profile", event))
}

// PublishServerTag vai para todo mundo, como o user:update: a tag aparece ao
// lado do nome em qualquer lugar.
func (h *Hub) PublishServerTag(event serverprofile.TagEvent) {
	h.BroadcastAll(wsevent.Marshal("server:tag", event))
}

// PublishUserServerTag: a tag de uma pessoa mudou (também para todo mundo).
func (h *Hub) PublishUserServerTag(event serverprofile.UserTagEvent) {
	h.BroadcastAll(wsevent.Marshal("user:server_tag", event))
}

// PlayingGames: quem está jogando agora, sem offline nem invisível (a atividade
// dessas pessoas não aparece para ninguém).
func (h *Hub) PlayingGames() []serverprofile.PlayedGame {
	h.mu.RLock()
	defer h.mu.RUnlock()
	plays := make([]serverprofile.PlayedGame, 0, len(h.rich.games.byUser))
	for userID, game := range h.rich.games.byUser {
		if h.effectiveStatusLocked(userID) == user.StatusOffline {
			continue
		}
		plays = append(plays, serverprofile.PlayedGame{
			UserID: userID,
			Game:   serverprofile.Game{Name: game.Name, AppID: game.AppID, IconHash: game.IconHash},
		})
	}
	return plays
}
