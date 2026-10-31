package music

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"os/exec"
	"runtime/debug"
	"sync"
	"sync/atomic"
	"time"
)

const (
	SystemKind      = "music"
	metadataTimeout = 15 * time.Second
	searchTTL       = 60 * time.Second
	playlistMax     = 50
	crossfade       = 5 * time.Second
	skipFade        = 1 * time.Second
	queueListMax    = 10
)

var (
	ErrSearchExpired  = errors.New("busca expirada")
	ErrNotInMusicCall = errors.New("você não está nessa call")
	errTooManyPlayers = errors.New("muitos players")
	errPlayerClosed   = errors.New("player encerrado antes de entrar no mapa")
	errChannelBusy    = errors.New("o canal já tem player")
)

type Location struct {
	CallID    string
	ChannelID string
	ServerID  string
}

// ManagerDeps liga o manager ao resto do backend (main.go) ou a dublês.
type ManagerDeps struct {
	Locate func(userID string) (Location, bool)
	Humans func(callID string) []string
	// Listeners: quem está ouvindo (não surdo) na call; nil = DJ não conta.
	Listeners       func(callID string) []string
	BotEnabled      func(ctx context.Context, serverID string) bool
	IsMember        func(ctx context.Context, serverID, userID string) bool
	ChannelName     func(ctx context.Context, channelID string) string
	User            func(ctx context.Context, userID string) (UserRef, error)
	PostPublic      func(ctx context.Context, textChannelID, content string) error
	SendToUser      func(userID string, event []byte)
	BroadcastToCall func(callID string, event []byte)
	BroadcastToRoom func(room string, event []byte)
	Tokens          BotTokens

	// Opcionais (testes); nil = implementação real a partir do Config.
	Source    Source
	Prepare   func(ctx context.Context, path string, at time.Duration) (io.ReadCloser, error)
	NewOutput func(ctx context.Context, callID, channelID string, src FrameSource) (Output, error)
	Available func() bool
	// Sessions: onde guardar os players para voltar depois de reiniciar
	// (restart.go); nil = não guarda.
	Sessions SessionStore
}

type searchSession struct {
	userID, serverID, textChannelID string
	results                         []Track
	expires                         time.Time
}

type Manager struct {
	cfg       Config
	deps      ManagerDeps
	available bool

	mu       sync.Mutex
	players  map[string]*Player // channelID -> player já iniciado
	pending  map[string]*pendingPlayer
	searches map[string]searchSession
	// found: buscas por texto já feitas (search_cache.go).
	found searchCache
	// Um comando por vez por usuário: não deixa ninguém disparar yt-dlp sem limite.
	busy map[string]struct{}
	// onPlayed: quem pediu a música que tocou o bastante (badge DJ, played.go).
	onPlayed func(userID string)
	// sessions: nil sem deps.Sessions. stopping: o servidor está desligando.
	sessions *sessionWriter
	stopping atomic.Bool
}

func NewManager(cfg Config, deps ManagerDeps) *Manager {
	if deps.Source == nil {
		if cfg.TestSource {
			deps.Source = NewTestSource(cfg.FFmpeg, ExecRunner)
		} else {
			deps.Source = NewYTDLP(cfg.YTDLP, cfg.Cookies, cfg.POTURL, ExecRunner)
		}
	}
	if deps.Prepare == nil {
		deps.Prepare = NewPreparer(cfg.FFmpeg, ExecRunner).Prepare
	}
	if deps.NewOutput == nil {
		lk := LiveKitConfig{URL: cfg.LiveKitURL, Tokens: deps.Tokens, FFmpeg: cfg.FFmpeg}
		deps.NewOutput = func(ctx context.Context, callID, channelID string, src FrameSource) (Output, error) {
			return NewLiveKitOutput(ctx, lk, callID, channelID, src)
		}
	}
	if deps.Available == nil {
		deps.Available = func() bool { return binariesPresent(cfg) }
	}
	m := &Manager{cfg: cfg, deps: deps, players: map[string]*Player{}, pending: map[string]*pendingPlayer{}, searches: map[string]searchSession{}, busy: map[string]struct{}{}}
	if deps.Sessions != nil {
		m.sessions = newSessionWriter(deps.Sessions)
	}
	m.available = deps.Available()
	if !m.available {
		log.Printf("[music] yt-dlp/ffmpeg não encontrados: o Maestro fica indisponível")
	}
	return m
}

func binariesPresent(cfg Config) bool {
	if _, err := exec.LookPath(cfg.FFmpeg); err != nil {
		return false
	}
	if cfg.TestSource {
		return true
	}
	_, err := exec.LookPath(cfg.YTDLP)
	return err == nil
}

func (m *Manager) Available() bool { return m.available }

func event(typ string, payload any) []byte {
	b, _ := json.Marshal(map[string]any{"type": typ, "payload": payload})
	return b
}

func (m *Manager) reply(userID, textChannelID, text string) {
	m.deps.SendToUser(userID, event("music:reply", map[string]string{"channel_id": textChannelID, "text": text}))
}

// HandleCommand é chamado pelo POST de mensagem de canal. true = era comando
// (não vira mensagem); o trabalho segue em segundo plano.
func (m *Manager) HandleCommand(serverID, textChannelID, userID, content string) bool {
	cmd, ok := ParseCommand(content)
	if !ok {
		return false
	}
	end, ok := m.begin(userID)
	if !ok {
		return true // já tem um comando dele em andamento: ignora em silêncio
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[music] pânico no comando: %v %s", r, debug.Stack())
			}
			end()
		}()
		m.run(serverID, textChannelID, userID, cmd)
	}()
	return true
}

func (m *Manager) run(serverID, textChannelID, userID string, cmd Command) {
	ctx := context.Background()
	say := func(text string) { m.reply(userID, textChannelID, text) }

	if !m.available {
		say(TextUnavailable)
		return
	}
	if !m.deps.BotEnabled(ctx, serverID) {
		say(TextBotRemoved)
		return
	}
	if cmd.Kind == KindHelp || (cmd.Kind == KindPlay && cmd.Arg == "") {
		say(TextHelp)
		return
	}
	loc, ok := m.deps.Locate(userID)
	if !ok || loc.ServerID != serverID {
		say(TextNotInVoice)
		return
	}

	switch cmd.Kind {
	case KindQueue:
		p := m.player(loc.ChannelID)
		if p == nil {
			say(TextNothingPlaying)
			return
		}
		text, ok := m.queueText(p)
		if !ok {
			say(TextNothingPlaying)
			return
		}
		say(text)
	case KindSkip:
		p := m.player(loc.ChannelID)
		if p == nil {
			say(TextNothingPlaying)
			return
		}
		switch r := p.Skip(userID); r.Kind {
		case SkipNothing:
			say(TextNothingPlaying)
		case SkipVoted:
			say(TextVoteCounted(r.Votes, r.Needed))
		case SkipAlready:
			say(TextAlreadyVoted(r.Votes, r.Needed))
		}
	case KindPlay:
		m.play(ctx, loc, serverID, textChannelID, userID, cmd.Arg, say)
	}
}

func (m *Manager) play(ctx context.Context, loc Location, serverID, textChannelID, userID, arg string, say func(string)) {
	a := ClassifyArg(arg)
	switch a.Kind {
	case ArgOtherURL:
		say(TextNotYouTube)
	case ArgSearch:
		mctx, cancel := context.WithTimeout(ctx, metadataTimeout)
		results, err := m.deps.Source.Search(mctx, a.Query, 5)
		cancel()
		if err != nil || len(results) == 0 {
			say(TextSearchEmpty(a.Query))
			return
		}
		token := newToken()
		m.mu.Lock()
		now := time.Now()
		for tk, ss := range m.searches {
			if now.After(ss.expires) {
				delete(m.searches, tk)
			}
		}
		m.searches[token] = searchSession{userID: userID, serverID: serverID, textChannelID: textChannelID, results: results, expires: time.Now().Add(searchTTL)}
		m.mu.Unlock()
		views := make([]map[string]any, len(results))
		for i, t := range results {
			views[i] = map[string]any{"video_id": t.VideoID, "title": t.Title, "artist": t.Artist, "thumbnail": t.Thumbnail, "duration_ms": t.DurationMs}
		}
		m.deps.SendToUser(userID, event("music:search", map[string]any{
			"token": token, "channel_id": textChannelID, "query": a.Query,
			"expires_at": time.Now().Add(searchTTL).UnixMilli(), "results": views,
		}))
	case ArgVideo:
		m.enqueueURL(ctx, loc, textChannelID, userID, a.URL, say)
	case ArgPlaylist:
		mctx, cancel := context.WithTimeout(ctx, metadataTimeout)
		name, tracks, err := m.deps.Source.Playlist(mctx, a.URL, playlistMax)
		cancel()
		var ok []Track
		for _, t := range tracks {
			if !t.IsLive && t.DurationMs > 0 && t.DurationMs <= maxVideoMs {
				ok = append(ok, t)
			}
		}
		if err != nil || len(ok) == 0 {
			say(TextPlaylistEmpty)
			return
		}
		m.enqueueTracks(ctx, loc, textChannelID, userID, ok, name, say)
	}
}

// Pick enfileira um resultado do seletor de busca (vale uma vez, por 60 s).
func (m *Manager) Pick(ctx context.Context, userID, token string, index int) error {
	m.mu.Lock()
	s, ok := m.searches[token]
	if ok && (s.userID != userID || time.Now().After(s.expires) || index < 0 || index >= len(s.results)) {
		ok = false
	}
	if ok {
		delete(m.searches, token)
	}
	m.mu.Unlock()
	if !ok {
		return ErrSearchExpired
	}
	loc, inVoice := m.deps.Locate(userID)
	say := func(text string) { m.reply(userID, s.textChannelID, text) }
	if !inVoice || loc.ServerID != s.serverID {
		say(TextNotInVoice)
		return nil
	}
	m.enqueueTrack(ctx, loc, s.textChannelID, userID, s.results[index], say)
	return nil
}

func newToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// playerOf: o player da call em que o usuário está, nesse servidor.
func (m *Manager) playerOf(userID, serverID string) (*Player, error) {
	loc, ok := m.deps.Locate(userID)
	if !ok || loc.ServerID != serverID {
		return nil, ErrNotInMusicCall
	}
	p := m.player(loc.ChannelID)
	if p == nil {
		return nil, ErrNotInMusicCall
	}
	return p, nil
}

func (m *Manager) SkipREST(userID, serverID string) (SkipResult, error) {
	p, err := m.playerOf(userID, serverID)
	if err != nil {
		return SkipResult{}, err
	}
	return p.Skip(userID), nil
}

func (m *Manager) Remove(userID, serverID, itemID string) error {
	p, err := m.playerOf(userID, serverID)
	if err != nil {
		return err
	}
	return p.Remove(itemID, userID)
}

func (m *Manager) Swap(userID, serverID, a, b string) error {
	p, err := m.playerOf(userID, serverID)
	if err != nil {
		return err
	}
	return p.Swap(a, b, userID)
}

func (m *Manager) SetWatching(userID, serverID string, watching bool) error {
	p, err := m.playerOf(userID, serverID)
	if err != nil {
		return err
	}
	p.SetWatching(userID, watching)
	return nil
}

func (m *Manager) StateFor(userID, serverID string) (*State, bool) {
	p, err := m.playerOf(userID, serverID)
	if err != nil {
		return nil, false
	}
	st := BuildState(p, time.Now())
	return &st, true
}

// PresenceFor: canais com o Maestro tocando, só para quem é membro do servidor.
func (m *Manager) PresenceFor(ctx context.Context, userID, serverID string) ([]string, bool) {
	if m.deps.IsMember == nil || !m.deps.IsMember(ctx, serverID, userID) {
		return nil, false
	}
	return m.Presence(serverID), true
}

// VideoFile: só quem está na call do player vê o vídeo.
func (m *Manager) VideoFile(userID, itemID string) (string, bool) {
	loc, ok := m.deps.Locate(userID)
	if !ok {
		return "", false
	}
	p := m.player(loc.ChannelID)
	if p == nil {
		return "", false
	}
	return p.VideoPath(itemID)
}
