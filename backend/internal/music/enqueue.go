package music

// Pôr na fila: um vídeo (link ou busca) ou uma playlist, com o aviso público.
// Extraído do manager.go.

import (
	"context"
	"errors"
	"log"
)

func (m *Manager) enqueueURL(ctx context.Context, loc Location, textChannelID, userID, url string, say func(string)) {
	mctx, cancel := context.WithTimeout(ctx, metadataTimeout)
	t, err := m.deps.Source.Resolve(mctx, url)
	cancel()
	switch {
	case errors.Is(err, ErrPrivate):
		say(TextPrivate)
	case err != nil:
		say(TextVideoGone)
	default:
		m.enqueueTrack(ctx, loc, textChannelID, userID, t, say)
	}
}

// enqueueTrack: um vídeo já conhecido (link resolvido ou resultado de busca,
// que traz duração e "ao vivo"), sem rodar o yt-dlp de novo. Vídeo com
// restrição de idade que escapar da busca falha no download (TextFailed).
func (m *Manager) enqueueTrack(ctx context.Context, loc Location, textChannelID, userID string, t Track, say func(string)) {
	switch {
	case t.IsLive:
		say(TextLive)
	case t.DurationMs > maxVideoMs:
		say(TextTooLong)
	default:
		m.enqueueTracks(ctx, loc, textChannelID, userID, []Track{t}, "", say)
	}
}

// enqueueTracks: playlistName vazio = um vídeo só.
func (m *Manager) enqueueTracks(ctx context.Context, loc Location, textChannelID, userID string, tracks []Track, playlistName string, say func(string)) {
	p, err := m.playerFor(ctx, loc)
	if errors.Is(err, errTooManyPlayers) {
		say(TextTooManyPlayers)
		return
	}
	if err != nil {
		log.Printf("[music] criar player: %v", err)
		say(TextUnavailable)
		return
	}
	user, err := m.deps.User(ctx, userID)
	if err != nil {
		p.IdleIfEmpty() // player criado sem nada na fila não pode ficar na call para sempre
		say(TextUnavailable)
		return
	}
	items := make([]*Item, len(tracks))
	for i, t := range tracks {
		items[i] = NewItem(t, user, textChannelID)
	}
	res, err := p.Enqueue(items, textChannelID)
	if errors.Is(err, ErrQueueFull) {
		say(TextQueueFull(m.cfg.QueueMax))
		return
	}
	if err != nil {
		p.IdleIfEmpty()
		say(TextUnavailable)
		return
	}
	var text string
	switch {
	case playlistName != "":
		text = TextAddedPlaylist(user.Username, playlistName, res.Added, res.AddedMs, p.ChannelName)
	case res.StartsNow:
		text = TextAddedNow(user.Username, tracks[0].Title, tracks[0].DurationMs, p.ChannelName)
	default:
		text = TextAdded(user.Username, tracks[0].Title, tracks[0].DurationMs, p.ChannelName, res.FirstPos, MinutesCeil(res.StartsInMs))
	}
	if err := m.deps.PostPublic(ctx, textChannelID, text); err != nil {
		log.Printf("[music] aviso público: %v", err)
	}
}
