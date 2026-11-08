package message

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"gin-quickstart/backend/internal/permission"
)

// Menções em massa num canal de servidor: @all avisa todo mundo do canal,
// @here só quem está online. Só pinga quem tem MENTION_EVERYONE no canal; de
// qualquer outro (ou numa DM) o texto fica como está e ninguém é avisado.
const (
	MentionAll  = "all"
	MentionHere = "here"
)

// Janela do anti-spam: um @all/@here que pinga por autor, por canal.
const mentionEveryoneCooldown = 30 * time.Second

func isNickByte(b byte) bool {
	return b == '_' || (b >= '0' && b <= '9') || (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z')
}

// DetectEveryoneMention acha @all/@here como palavra inteira (sem diferenciar
// maiúsculas): o "@" precisa abrir o token (começo, espaço ou pontuação de
// abertura), então não vale dentro de palavra, e-mail ("x@all.com") nem link
// ("x.com/@all"); também não vale nick maior ("@allan", "@all.bot"). Se as duas aparecem, @all ganha. Mesma regra
// de token do @nick do app (lib/mentions.ts). Dentro de código (`trecho` ou
// bloco ```) não vale, como no Discord (StripCode).
func DetectEveryoneMention(content string) string {
	hasAll, hasHere := everyoneMentions(content)
	switch {
	case hasAll:
		return MentionAll
	case hasHere:
		return MentionHere
	}
	return ""
}

// containsEveryone: o texto ainda marca este @all/@here (mesma regra de token)?
func containsEveryone(content string, kind string) bool {
	hasAll, hasHere := everyoneMentions(content)
	return (kind == MentionAll && hasAll) || (kind == MentionHere && hasHere)
}

// everyoneMentions diz quais de @all e @here aparecem como palavra inteira.
func everyoneMentions(content string) (hasAll bool, hasHere bool) {
	lower := strings.ToLower(StripCode(content))
	for i := 0; i < len(lower); i++ {
		if lower[i] != '@' {
			continue
		}
		if !opensToken(lower[:i]) {
			continue
		}
		for _, word := range []string{MentionAll, MentionHere} {
			end := i + 1 + len(word)
			if !strings.HasPrefix(lower[i+1:], word) || !tokenEndsAt(lower, end) {
				continue
			}
			if word == MentionAll {
				hasAll = true
			} else {
				hasHere = true
			}
		}
		if hasAll && hasHere {
			return
		}
	}
	return
}

// opensToken: o que vem antes do "@" deixa começar uma menção? Só o começo
// da mensagem, espaço ou pontuação de abertura — assim "x.com/@all",
// "#@all" ou "é@all" (links, palavras) não pingam ninguém.
func opensToken(before string) bool {
	if before == "" {
		return true
	}
	prev, _ := utf8.DecodeLastRuneInString(before)
	return unicode.IsSpace(prev) || strings.ContainsRune(mentionOpeners, prev)
}

// Pontuação que pode vir logo antes de uma menção (igual em lib/mentions.ts).
const mentionOpeners = "([{\"'<*~“‘«"

// tokenEndsAt: o nick acaba em end? Só se vier fim, espaço ou pontuação de
// fechamento. Letra, número, "-", "_", "@", "/" ou apóstrofo seguido de letra
// ("@all's") continuam a palavra; ponto seguido de nick também ("@all.bot"),
// mas ponto final conta ("@all."). Mesma regra de lib/mentions.ts.
func tokenEndsAt(s string, end int) bool {
	if end >= len(s) {
		return true
	}
	r, size := utf8.DecodeRuneInString(s[end:])
	switch {
	case unicode.IsSpace(r):
		return true
	case r == '.':
		j := end
		for j < len(s) && s[j] == '.' {
			j++
		}
		if j >= len(s) {
			return true
		}
		if isNickByte(s[j]) {
			return false
		}
		return tokenEndsAt(s, j)
	case r == '\'' || r == '’':
		next, _ := utf8.DecodeRuneInString(s[end+size:])
		return !unicode.IsLetter(next)
	}
	return strings.ContainsRune(mentionClosers, r)
}

// Pontuação que pode vir logo depois de uma menção (igual em lib/mentions.ts).
// Apóstrofo e ponto têm regra própria em tokenEndsAt.
const mentionClosers = ",!?:;)]}\"”»>*~"

// mentionLimiter guarda, em memória, o último @all/@here que pingou por autor
// e canal. Uma instância do backend só; reiniciar zera as janelas.
type mentionLimiter struct {
	mu     sync.Mutex
	window time.Duration
	now    func() time.Time
	last   map[string]time.Time
}

func newMentionLimiter(window time.Duration, now func() time.Time) *mentionLimiter {
	return &mentionLimiter{window: window, now: now, last: make(map[string]time.Time)}
}

// Allow diz se este autor pode pingar o canal agora e, se pode, marca a vez.
func (l *mentionLimiter) Allow(authorID string, channelID string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	key := authorID + "|" + channelID
	if last, ok := l.last[key]; ok && now.Sub(last) < l.window {
		return false
	}
	l.last[key] = now

	// Não deixa o mapa crescer para sempre: limpa as janelas vencidas.
	if len(l.last) > 1024 {
		for k, t := range l.last {
			if now.Sub(t) >= l.window {
				delete(l.last, k)
			}
		}
	}
	return true
}

// Release devolve a vez marcada por Allow (a mensagem não chegou a sair).
func (l *mentionLimiter) Release(authorID string, channelID string) {
	l.mu.Lock()
	delete(l.last, authorID+"|"+channelID)
	l.mu.Unlock()
}

// resolveMentionEveryone decide o mention_everyone de uma mensagem nova num
// canal: "all"/"here" se o texto marca e o autor pode (MENTION_EVERYONE no
// canal, dentro do anti-spam); senão nil — a mensagem sai igual, só não pinga.
func (s *Service) resolveMentionEveryone(ctx context.Context, serverID string, channelID string, authorID string, content string) *string {
	kind := DetectEveryoneMention(content)
	if kind == "" || serverID == "" || channelID == "" || s.perms == nil {
		return nil
	}
	perms, err := s.perms.ChannelPerms(ctx, channelID, authorID)
	if err != nil {
		log.Printf("mention_everyone: failed to check permissions of %s in %s: %v", authorID, channelID, err)
		return nil
	}
	if !permission.Has(perms, permission.MentionEveryone) || !s.mentionLimiter.Allow(authorID, channelID) {
		return nil
	}
	return &kind
}
