package message

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"gin-quickstart/backend/internal/permission"

	"github.com/google/uuid"
)

// Busca de mensagens (DMs e servidor), no jeito do Discord: texto livre mais
// filtros "chave:valor" (from:, in:, has:, mentions:, before:, after:,
// during:, authorType:, pinned:). A mesma gramática existe no app
// (lib/messageSearch.ts), que monta a barra com sugestões; aqui ela vale tanto
// para o q= cru quanto para os parâmetros separados.

const (
	// SearchPageSize é o tamanho padrão da página; SearchMaxPageSize, o teto.
	SearchPageSize    = 25
	SearchMaxPageSize = 50
	// SearchMaxResults: até onde dá para paginar (e onde a contagem para).
	// Mais que isso é "1000+": quem precisa disso refina a busca.
	SearchMaxResults = 1000

	searchMaxQueryLen = 500
	searchMaxTerms    = 10
	searchMaxTermLen  = 100
	searchMaxValues   = 10
)

// Tipos aceitos no has: (o valor canônico é o do Discord, em inglês).
const (
	HasLink  = "link"
	HasImage = "image"
	HasVideo = "video"
	HasAudio = "audio"
	HasFile  = "file"
	HasPoll  = "poll"
)

// Ordem dos resultados.
const (
	SortNewest    = "newest"
	SortOldest    = "oldest"
	SortRelevance = "relevance"
)

// Tipo de autor (authorType:).
const (
	AuthorUser = "user"
	AuthorBot  = "bot"
)

var (
	ErrSearchEmpty   = errors.New("search query is empty")
	ErrSearchInvalid = errors.New("invalid search query")
)

// SearchError diz o que está errado na busca (o code vai na resposta).
type SearchError struct {
	Field string
	Value string
}

func (e *SearchError) Error() string {
	return fmt.Sprintf("invalid %s: %q", e.Field, e.Value)
}

func (e *SearchError) Unwrap() error { return ErrSearchInvalid }

// SearchQuery é o texto da barra separado em termos e filtros, ainda sem
// validar os valores (ParseSearchText).
type SearchQuery struct {
	Terms      []string
	From       []string
	In         []string
	Has        []string
	Mentions   []string
	Before     string
	After      string
	During     string
	AuthorType string
	Pinned     string
}

// searchKeys: chave do filtro (minúscula) -> nome canônico.
var searchKeys = map[string]string{
	"from":        "from",
	"in":          "in",
	"has":         "has",
	"mentions":    "mentions",
	"before":      "before",
	"after":       "after",
	"during":      "during",
	"authortype":  "authorType",
	"author_type": "authorType",
	"pinned":      "pinned",
}

// splitSearchTokens quebra o texto em palavras, respeitando aspas: "bom dia"
// é um termo só e in:"canal com espaço" é um filtro só. Aspas sem par vão
// até o fim.
func splitSearchTokens(raw string) []string {
	var tokens []string
	var cur strings.Builder
	inQuote := false
	hasToken := false
	for _, r := range raw {
		switch {
		case r == '"':
			inQuote = !inQuote
			cur.WriteRune(r)
			hasToken = true
		case unicode.IsSpace(r) && !inQuote:
			if hasToken {
				tokens = append(tokens, cur.String())
				cur.Reset()
				hasToken = false
			}
		default:
			cur.WriteRune(r)
			hasToken = true
		}
	}
	if hasToken {
		tokens = append(tokens, cur.String())
	}
	return tokens
}

func unquote(s string) string {
	return strings.TrimSpace(strings.ReplaceAll(s, `"`, ""))
}

// ParseSearchText separa o texto da barra em termos livres e filtros. Chave
// desconhecida ("http://", "obs:") é texto; filtro sem valor ("from:") é
// ignorado, como quando a pessoa ainda está digitando.
func ParseSearchText(raw string) SearchQuery {
	var q SearchQuery
	for _, tok := range splitSearchTokens(raw) {
		key, value, found := strings.Cut(tok, ":")
		name, isKey := searchKeys[strings.ToLower(key)]
		if !found || !isKey || strings.Contains(key, `"`) {
			if term := unquote(tok); term != "" {
				q.Terms = append(q.Terms, term)
			}
			continue
		}
		value = unquote(value)
		if value == "" {
			continue
		}
		switch name {
		case "from":
			q.From = append(q.From, strings.TrimPrefix(value, "@"))
		case "in":
			q.In = append(q.In, strings.TrimPrefix(value, "#"))
		case "has":
			q.Has = append(q.Has, value)
		case "mentions":
			q.Mentions = append(q.Mentions, strings.TrimPrefix(value, "@"))
		case "before":
			q.Before = value
		case "after":
			q.After = value
		case "during":
			q.During = value
		case "authorType":
			q.AuthorType = value
		case "pinned":
			q.Pinned = value
		}
	}
	return q
}

// SearchFilter é a busca validada, pronta para o SQL.
type SearchFilter struct {
	// Terms: todos precisam aparecer no texto (sem acento nem maiúsculas).
	Terms []string
	// From/In: ids ou nomes em minúsculas; vale qualquer um deles.
	From []string
	In   []string
	// Has e Mentions: vale só se tiver todos.
	Has      []string
	Mentions []string
	// Since (inclusive) e Until (exclusive) em created_at.
	Since      *time.Time
	Until      *time.Time
	AuthorType string
	Pinned     *bool
	Sort       string
	Limit      int
	Offset     int
}

// Empty: sem texto e sem filtro nenhum (a busca não começa).
func (f SearchFilter) Empty() bool {
	return len(f.Terms) == 0 && len(f.From) == 0 && len(f.In) == 0 && len(f.Has) == 0 &&
		len(f.Mentions) == 0 && f.Since == nil && f.Until == nil && f.AuthorType == "" && f.Pinned == nil
}

var (
	usernameValue = regexp.MustCompile(`^[A-Za-z0-9_]{1,32}$`)
	isoDate       = regexp.MustCompile(`^(\d{4})-(\d{1,2})-(\d{1,2})$`)
	brDate        = regexp.MustCompile(`^(\d{1,2})/(\d{1,2})/(\d{4})$`)
)

// foldAccents tira os acentos comuns do português (valores de has:/authorType:).
func foldAccents(s string) string {
	r := strings.NewReplacer("á", "a", "à", "a", "â", "a", "ã", "a", "é", "e", "ê", "e",
		"í", "i", "ó", "o", "ô", "o", "õ", "o", "ú", "u", "ç", "c")
	return r.Replace(strings.ToLower(s))
}

var hasAliases = map[string]string{
	"link": HasLink, "links": HasLink, "embed": HasLink,
	"image": HasImage, "imagem": HasImage, "imagens": HasImage, "foto": HasImage,
	"video": HasVideo, "videos": HasVideo,
	"audio": HasAudio, "audios": HasAudio,
	"file": HasFile, "arquivo": HasFile, "arquivos": HasFile, "anexo": HasFile,
	"poll": HasPoll, "enquete": HasPoll, "enquetes": HasPoll,
}

// NormalizeHas devolve o tipo canônico do has: (aceita português e inglês).
func NormalizeHas(value string) (string, bool) {
	kind, ok := hasAliases[foldAccents(value)]
	return kind, ok
}

func normalizeAuthorType(value string) (string, bool) {
	switch foldAccents(value) {
	case "user", "usuario", "pessoa", "humano":
		return AuthorUser, true
	case "bot", "bots":
		return AuthorBot, true
	}
	return "", false
}

func normalizePinned(value string) (bool, bool) {
	switch foldAccents(value) {
	case "true", "sim", "yes", "1":
		return true, true
	case "false", "nao", "no", "0":
		return false, true
	}
	return false, false
}

// searchValues junta os valores repetidos (?from=a&from=b) e os separados
// por vírgula (?from=a,b).
func searchValues(values url.Values, key string) []string {
	var out []string
	for _, raw := range values[key] {
		for _, v := range strings.Split(raw, ",") {
			if v = strings.TrimSpace(v); v != "" {
				out = append(out, v)
			}
		}
	}
	return out
}

func dedupe(values []string) []string {
	out := make([]string, 0, len(values))
	for _, v := range values {
		if !slices.Contains(out, v) {
			out = append(out, v)
		}
	}
	return out
}

// ParseSearchParams valida a busca da URL: q= (texto, com filtros dentro ou
// não) mais os filtros em parâmetros próprios, que se somam aos do texto.
// Também: sort (newest|oldest|relevance), limit, offset e tz_offset (minutos a
// leste de UTC, para before/after/during caírem no dia da pessoa).
func ParseSearchParams(values url.Values) (SearchFilter, error) {
	raw := values.Get("q")
	if utf8.RuneCountInString(raw) > searchMaxQueryLen {
		return SearchFilter{}, &SearchError{Field: "q", Value: "too long"}
	}
	q := ParseSearchText(raw)
	q.From = append(q.From, searchValues(values, "from")...)
	q.In = append(q.In, searchValues(values, "in")...)
	q.Has = append(q.Has, searchValues(values, "has")...)
	q.Mentions = append(q.Mentions, searchValues(values, "mentions")...)
	for key, dst := range map[string]*string{"before": &q.Before, "after": &q.After, "during": &q.During, "author_type": &q.AuthorType, "pinned": &q.Pinned} {
		if v := strings.TrimSpace(values.Get(key)); v != "" {
			*dst = v
		}
	}

	f := SearchFilter{Sort: SortNewest, Limit: SearchPageSize}

	if len(q.Terms) > searchMaxTerms {
		return SearchFilter{}, &SearchError{Field: "q", Value: "too many terms"}
	}
	for _, t := range q.Terms {
		if utf8.RuneCountInString(t) > searchMaxTermLen {
			return SearchFilter{}, &SearchError{Field: "q", Value: t}
		}
		f.Terms = append(f.Terms, t)
	}

	for _, list := range [][]string{q.From, q.In, q.Has, q.Mentions} {
		if len(list) > searchMaxValues {
			return SearchFilter{}, &SearchError{Field: "filter", Value: "too many values"}
		}
	}
	for _, v := range q.From {
		v = strings.TrimPrefix(v, "@")
		if _, err := uuid.Parse(v); err != nil && !usernameValue.MatchString(v) {
			return SearchFilter{}, &SearchError{Field: "from", Value: v}
		}
		f.From = append(f.From, strings.ToLower(v))
	}
	for _, v := range q.In {
		v = strings.TrimPrefix(v, "#")
		if v == "" || utf8.RuneCountInString(v) > 100 {
			return SearchFilter{}, &SearchError{Field: "in", Value: v}
		}
		f.In = append(f.In, strings.ToLower(v))
	}
	for _, v := range q.Has {
		kind, ok := NormalizeHas(v)
		if !ok {
			return SearchFilter{}, &SearchError{Field: "has", Value: v}
		}
		f.Has = append(f.Has, kind)
	}
	for _, v := range q.Mentions {
		v = strings.TrimPrefix(v, "@")
		if !usernameValue.MatchString(v) {
			return SearchFilter{}, &SearchError{Field: "mentions", Value: v}
		}
		f.Mentions = append(f.Mentions, strings.ToLower(v))
	}
	f.From, f.In, f.Has, f.Mentions = dedupe(f.From), dedupe(f.In), dedupe(f.Has), dedupe(f.Mentions)

	loc := time.UTC
	if raw := values.Get("tz_offset"); raw != "" {
		minutes, err := strconv.Atoi(raw)
		if err != nil || minutes < -14*60 || minutes > 14*60 {
			return SearchFilter{}, &SearchError{Field: "tz_offset", Value: raw}
		}
		loc = time.FixedZone("", minutes*60)
	}
	since, until, err := searchDateRange(q, loc)
	if err != nil {
		return SearchFilter{}, err
	}
	f.Since, f.Until = since, until

	if q.AuthorType != "" {
		kind, ok := normalizeAuthorType(q.AuthorType)
		if !ok {
			return SearchFilter{}, &SearchError{Field: "author_type", Value: q.AuthorType}
		}
		f.AuthorType = kind
	}
	if q.Pinned != "" {
		pinned, ok := normalizePinned(q.Pinned)
		if !ok {
			return SearchFilter{}, &SearchError{Field: "pinned", Value: q.Pinned}
		}
		f.Pinned = &pinned
	}

	switch s := values.Get("sort"); s {
	case "", SortNewest:
	case SortOldest, SortRelevance:
		f.Sort = s
	default:
		return SearchFilter{}, &SearchError{Field: "sort", Value: s}
	}
	if raw := values.Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 {
			return SearchFilter{}, &SearchError{Field: "limit", Value: raw}
		}
		f.Limit = min(n, SearchMaxPageSize)
	}
	if raw := values.Get("offset"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			return SearchFilter{}, &SearchError{Field: "offset", Value: raw}
		}
		f.Offset = n
	}
	// Não pagina além do teto de resultados.
	if f.Offset >= SearchMaxResults {
		f.Offset = SearchMaxResults
		f.Limit = 0
	} else if f.Offset+f.Limit > SearchMaxResults {
		f.Limit = SearchMaxResults - f.Offset
	}
	return f, nil
}

// SearchableChannels: canais de texto do servidor em que a pessoa vê o canal
// e lê o histórico (as mesmas regras de abrir o canal). Ordenados.
func SearchableChannels(snap *permission.Snapshot, userID string) []string {
	if snap == nil || !snap.IsMember(userID) {
		return nil
	}
	var ids []string
	for id, ch := range snap.Channels {
		if ch.Type != permission.ChannelText {
			continue
		}
		if permission.Has(snap.Channel(id, userID), permission.ViewChannel|permission.ReadHistory) {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids
}

// SearchScope: onde buscar. Canais de servidor (já filtrados pelo que a
// pessoa vê) ou uma conversa.
type SearchScope struct {
	ChannelIDs     []string
	ConversationID string
}

// escapeLike escapa os curingas do LIKE (o termo é texto, não padrão).
func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// mentionPattern: regex (Postgres, sem diferenciar maiúsculas) de @username
// como palavra inteira, com a mesma regra de token do @nick do app: o "@"
// abre o token (começo, espaço ou pontuação de abertura) e o nick acaba em
// fim, espaço, pontuação ou ponto final. username já validado.
func mentionPattern(username string) string {
	return `(^|[[:space:]([{"'<*~“‘«])@` + username + `($|[^A-Za-z0-9_.@/'’-]|\.+($|[^A-Za-z0-9_])|['’]($|[^[:alpha:]]))`
}

// sqlArgs monta os placeholders $n na ordem.
type sqlArgs struct{ values []any }

func (a *sqlArgs) add(v any) string {
	a.values = append(a.values, v)
	return "$" + strconv.Itoa(len(a.values))
}

// buildSearchWhere monta o WHERE da busca (sobre messages m, users u e
// channels c) e os argumentos. O texto e o LIKE usam search_normalize, a
// mesma função do índice de trigramas (migration 000055).
func buildSearchWhere(scope SearchScope, f SearchFilter, args *sqlArgs) string {
	conds := []string{notExpired}
	if scope.ConversationID != "" {
		conds = append(conds, "m.conversation_id = "+args.add(scope.ConversationID)+"::uuid")
	} else {
		conds = append(conds, "m.channel_id = ANY("+args.add(scope.ChannelIDs)+"::uuid[])")
	}
	for _, t := range f.Terms {
		conds = append(conds, "search_normalize(m.content) LIKE '%' || search_normalize("+args.add(escapeLike(t))+"::text) || '%'")
	}
	if len(f.From) > 0 {
		p := args.add(f.From)
		conds = append(conds, "(u.id::text = ANY("+p+"::text[]) OR lower(u.username) = ANY("+p+"::text[]))")
	}
	if len(f.In) > 0 {
		p := args.add(f.In)
		conds = append(conds, "(m.channel_id::text = ANY("+p+"::text[]) OR lower(c.name) = ANY("+p+"::text[]))")
	}
	conds = append(conds, hasConds(f.Has, args)...)
	for _, name := range f.Mentions {
		conds = append(conds, "m.content ~* "+args.add(mentionPattern(name)))
	}
	if f.Since != nil {
		conds = append(conds, "m.created_at >= "+args.add(*f.Since))
	}
	if f.Until != nil {
		conds = append(conds, "m.created_at < "+args.add(*f.Until))
	}
	switch f.AuthorType {
	case AuthorBot:
		conds = append(conds, "u.is_bot")
	case AuthorUser:
		conds = append(conds, "NOT u.is_bot")
	}
	if f.Pinned != nil {
		pinned := "EXISTS (SELECT 1 FROM channel_pinned_messages pm WHERE pm.message_id = m.id)"
		if !*f.Pinned {
			pinned = "NOT " + pinned
		}
		conds = append(conds, pinned)
	}
	return strings.Join(conds, "\n\t\tAND ")
}

// hasConds: uma condição por tipo do has:. Imagem e vídeo ignoram anexo de
// visualização única, que a busca não pode revelar (D11).
func hasConds(kinds []string, args *sqlArgs) []string {
	var conds []string
	for _, kind := range kinds {
		switch kind {
		case HasLink:
			conds = append(conds, `m.content ~* 'https?://'`)
		case HasFile:
			conds = append(conds, "EXISTS (SELECT 1 FROM message_attachments a WHERE a.message_id = m.id)")
		case HasImage, HasVideo, HasAudio:
			conds = append(conds, "EXISTS (SELECT 1 FROM message_attachments a WHERE a.message_id = m.id AND a.kind = "+args.add(kind)+" AND NOT a.view_once)")
		case HasPoll:
			conds = append(conds, "EXISTS (SELECT 1 FROM polls p WHERE p.message_id = m.id)")
		}
	}
	return conds
}

// buildSearchOrder: newest/oldest por (created_at, id); relevance pelo
// quanto o texto se parece com os termos (word_similarity do pg_trgm), com a
// mais nova desempatando. Sem texto, relevance é newest.
func buildSearchOrder(f SearchFilter, args *sqlArgs) string {
	switch {
	case f.Sort == SortOldest:
		return "m.created_at ASC, m.id ASC"
	case f.Sort == SortRelevance && len(f.Terms) > 0:
		p := args.add(strings.Join(f.Terms, " "))
		return "word_similarity(search_normalize(" + p + "::text), search_normalize(m.content)) DESC, m.created_at DESC, m.id DESC"
	}
	return "m.created_at DESC, m.id DESC"
}
