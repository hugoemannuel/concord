// Package castigo põe alguém de castigo nas calls de um servidor por um
// tempo: sem falar, sem entrar em call ou sem ouvir. Quem tem as permissões
// de moderação de voz aplica direto; qualquer pessoa da call pode abrir uma
// votação, e o castigo vale se a maioria da call aceitar.
// Ver docs/adr/0061-castigo-na-call.md.
package castigo

import (
	"errors"
	"time"

	"gin-quickstart/backend/internal/call"
	"gin-quickstart/backend/internal/permission"
)

var (
	ErrInvalid      = errors.New("escolha o que o castigo tira e uma duração válida")
	ErrNotMember    = permission.ErrNotMember
	ErrMissingPerm  = permission.ErrMissingPermission
	ErrCannotActOn  = errors.New("você não pode castigar alguém de cargo igual ou acima do seu")
	ErrOwner        = errors.New("o dono do servidor não fica de castigo")
	ErrSelf         = errors.New("você não pode castigar a si mesmo")
	ErrNotFound     = errors.New("essa pessoa não está de castigo")
	ErrNotInCall    = errors.New("vocês dois precisam estar nesta call")
	ErrFewVoters    = errors.New("a votação precisa de pelo menos 3 pessoas na call")
	ErrVoteOpen     = errors.New("já tem uma votação de castigo nesta call")
	ErrVoteCooldown = errors.New("espere um pouco para abrir outra votação")
	ErrVoteNotFound = errors.New("essa votação já acabou")
	ErrNotVoter     = errors.New("só quem estava na call quando a votação abriu vota")
	ErrAlreadyVoted = errors.New("você já votou")
)

// Effects: o que o castigo tira.
type Effects struct {
	Speak   bool `json:"speak"`
	Connect bool `json:"connect"`
	Listen  bool `json:"listen"`
}

func (e Effects) any() bool { return e.Speak || e.Connect || e.Listen }

// perms: as permissões de moderação de voz que aplicar (ou tirar) estes
// efeitos exige de quem castiga direto. Os bits de permissão acabaram
// (ADR 0054): cada efeito usa a moderação que ele prolonga.
func (e Effects) perms() int64 {
	var want int64
	if e.Speak {
		want |= permission.MuteMembers
	}
	if e.Listen {
		want |= permission.DeafenMembers
	}
	if e.Connect {
		want |= permission.DisconnectMembers
	}
	return want
}

// Durations: os prazos que dá para escolher (os mesmos do app).
var Durations = []time.Duration{time.Minute, 5 * time.Minute, 10 * time.Minute, 30 * time.Minute, time.Hour}

// duration: o prazo pedido em segundos, se for um dos permitidos.
func duration(seconds int) (time.Duration, bool) {
	d := time.Duration(seconds) * time.Second
	for _, ok := range Durations {
		if d == ok {
			return d, true
		}
	}
	return 0, false
}

// Castigo: até quando cada efeito vale para a pessoa no servidor (nil = não
// vale). Castigos somados ficam com o prazo mais longo de cada efeito.
type Castigo struct {
	ServerID     string     `json:"server_id"`
	UserID       string     `json:"user_id"`
	SpeakUntil   *time.Time `json:"speak_until"`
	ConnectUntil *time.Time `json:"connect_until"`
	ListenUntil  *time.Time `json:"listen_until"`
}

func live(until *time.Time, now time.Time) bool { return until != nil && until.After(now) }

// effects: o que vale agora.
func (c Castigo) effects(now time.Time) Effects {
	return Effects{Speak: live(c.SpeakUntil, now), Connect: live(c.ConnectUntil, now), Listen: live(c.ListenUntil, now)}
}

func (c Castigo) active(now time.Time) bool { return c.effects(now).any() }

// Restriction: o castigo no formato da chamada.
func (c Castigo) restriction(now time.Time) call.Restriction {
	e := c.effects(now)
	return call.Restriction{NoSpeak: e.Speak, NoConnect: e.Connect, NoListen: e.Listen}
}

func later(cur *time.Time, until time.Time) *time.Time {
	if cur != nil && cur.After(until) {
		return cur
	}
	return &until
}

// with soma os efeitos até until (fica o prazo mais longo de cada um).
func (c Castigo) with(e Effects, until time.Time) Castigo {
	if e.Speak {
		c.SpeakUntil = later(c.SpeakUntil, until)
	}
	if e.Connect {
		c.ConnectUntil = later(c.ConnectUntil, until)
	}
	if e.Listen {
		c.ListenUntil = later(c.ListenUntil, until)
	}
	return c
}

func keep(until *time.Time, now time.Time) *time.Time {
	if live(until, now) {
		return until
	}
	return nil
}

// pruned: sem os efeitos que já venceram.
func (c Castigo) pruned(now time.Time) Castigo {
	c.SpeakUntil, c.ConnectUntil, c.ListenUntil = keep(c.SpeakUntil, now), keep(c.ConnectUntil, now), keep(c.ListenUntil, now)
	return c
}

// changedBy: pruned tirou algum efeito.
func (c Castigo) changedBy(p Castigo) bool {
	return (c.SpeakUntil == nil) != (p.SpeakUntil == nil) ||
		(c.ConnectUntil == nil) != (p.ConnectUntil == nil) ||
		(c.ListenUntil == nil) != (p.ListenUntil == nil)
}
