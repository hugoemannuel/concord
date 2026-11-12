package message

import (
	"errors"
	"net/url"
	"reflect"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/permission"
)

func TestParseSearchText(t *testing.T) {
	cases := []struct {
		raw  string
		want SearchQuery
	}{
		{"", SearchQuery{}},
		{"bom dia", SearchQuery{Terms: []string{"bom", "dia"}}},
		{`"bom dia" pessoal`, SearchQuery{Terms: []string{"bom dia", "pessoal"}}},
		{"from:ana oi", SearchQuery{Terms: []string{"oi"}, From: []string{"ana"}}},
		{"FROM:@Ana", SearchQuery{From: []string{"Ana"}}},
		{"in:#geral in:\"sala de jogos\"", SearchQuery{In: []string{"geral", "sala de jogos"}}},
		{"has:link has:imagem", SearchQuery{Has: []string{"link", "imagem"}}},
		{"mentions:@bia", SearchQuery{Mentions: []string{"bia"}}},
		{"before:2026-01-02 after:2025-12-01 during:2025-12-25", SearchQuery{Before: "2026-01-02", After: "2025-12-01", During: "2025-12-25"}},
		{"authorType:bot pinned:true", SearchQuery{AuthorType: "bot", Pinned: "true"}},
		{"author_type:user", SearchQuery{AuthorType: "user"}},
		// Chave desconhecida é texto; filtro sem valor (ainda digitando) some.
		{"https://x.com obs:nada", SearchQuery{Terms: []string{"https://x.com", "obs:nada"}}},
		{"from: oi", SearchQuery{Terms: []string{"oi"}}},
		// O último before/after/during vale.
		{"before:2026-01-01 before:2026-02-01", SearchQuery{Before: "2026-02-01"}},
		// Aspas sem par vão até o fim.
		{`"sem fim de aspas`, SearchQuery{Terms: []string{"sem fim de aspas"}}},
		{"  muitos   espaços\t", SearchQuery{Terms: []string{"muitos", "espaços"}}},
	}
	for _, tc := range cases {
		got := ParseSearchText(tc.raw)
		if !reflect.DeepEqual(got, tc.want) {
			t.Errorf("ParseSearchText(%q)\n got %+v\nwant %+v", tc.raw, got, tc.want)
		}
	}
}

func params(kv ...string) url.Values {
	v := url.Values{}
	for i := 0; i+1 < len(kv); i += 2 {
		v.Add(kv[i], kv[i+1])
	}
	return v
}

func mustParams(t *testing.T, v url.Values) SearchFilter {
	t.Helper()
	f, err := ParseSearchParams(v)
	if err != nil {
		t.Fatalf("ParseSearchParams(%v): %v", v, err)
	}
	return f
}

func TestParseSearchParamsMergesTextAndParams(t *testing.T) {
	f := mustParams(t, params(
		"q", "oi from:Ana has:imagem",
		"from", "bia,ana",
		"has", "enquete",
		"in", "#Geral",
		"mentions", "@Caio",
	))
	if !reflect.DeepEqual(f.Terms, []string{"oi"}) {
		t.Errorf("terms = %v", f.Terms)
	}
	if !reflect.DeepEqual(f.From, []string{"ana", "bia"}) {
		t.Errorf("from = %v (minúsculas, sem repetir)", f.From)
	}
	if !reflect.DeepEqual(f.Has, []string{HasImage, HasPoll}) {
		t.Errorf("has = %v", f.Has)
	}
	if !reflect.DeepEqual(f.In, []string{"geral"}) || !reflect.DeepEqual(f.Mentions, []string{"caio"}) {
		t.Errorf("in = %v, mentions = %v", f.In, f.Mentions)
	}
	if f.Sort != SortNewest || f.Limit != SearchPageSize || f.Offset != 0 {
		t.Errorf("padrões: sort %q limit %d offset %d", f.Sort, f.Limit, f.Offset)
	}
}

func TestParseSearchParamsHasAliases(t *testing.T) {
	cases := map[string]string{
		"link": HasLink, "embed": HasLink, "imagem": HasImage, "image": HasImage,
		"vídeo": HasVideo, "video": HasVideo, "Áudio": HasAudio, "arquivo": HasFile,
		"file": HasFile, "enquete": HasPoll, "poll": HasPoll,
	}
	for in, want := range cases {
		f := mustParams(t, params("has", in))
		if !reflect.DeepEqual(f.Has, []string{want}) {
			t.Errorf("has:%s = %v, want %s", in, f.Has, want)
		}
	}
}

func TestParseSearchParamsDates(t *testing.T) {
	day := func(y int, m time.Month, d int, loc *time.Location) time.Time {
		return time.Date(y, m, d, 0, 0, 0, 0, loc)
	}
	br := time.FixedZone("", -180*60)

	f := mustParams(t, params("q", "before:2026-03-10"))
	if f.Since != nil || f.Until == nil || !f.Until.Equal(day(2026, 3, 10, time.UTC)) {
		t.Errorf("before: since %v until %v", f.Since, f.Until)
	}
	// after:D começa no dia seguinte (como no Discord).
	f = mustParams(t, params("q", "after:10/03/2026", "tz_offset", "-180"))
	if f.Until != nil || f.Since == nil || !f.Since.Equal(day(2026, 3, 11, br)) {
		t.Errorf("after: since %v until %v", f.Since, f.Until)
	}
	f = mustParams(t, params("during", "2026-03-10", "tz_offset", "-180"))
	if !f.Since.Equal(day(2026, 3, 10, br)) || !f.Until.Equal(day(2026, 3, 11, br)) {
		t.Errorf("during: since %v until %v", f.Since, f.Until)
	}
	// Juntos: o intervalo mais estreito.
	f = mustParams(t, params("q", "during:2026-03-10 before:2026-03-05"))
	if !f.Until.Equal(day(2026, 3, 5, time.UTC)) || !f.Since.Equal(day(2026, 3, 10, time.UTC)) {
		t.Errorf("during+before: since %v until %v", f.Since, f.Until)
	}

	for _, bad := range []string{"2026-02-30", "ontem", "31/13/2026", "1999-01-01", "2026-3"} {
		_, err := ParseSearchParams(params("before", bad))
		var se *SearchError
		if !errors.As(err, &se) || se.Field != "before" || !errors.Is(err, ErrSearchInvalid) {
			t.Errorf("before:%s err = %v, want SearchError(before)", bad, err)
		}
	}
	if _, err := ParseSearchParams(params("q", "oi", "tz_offset", "9999")); err == nil {
		t.Error("tz_offset fora de ±14h devia dar erro")
	}
}

func TestParseSearchParamsAuthorTypeAndPinned(t *testing.T) {
	f := mustParams(t, params("q", "authorType:Usuário pinned:sim"))
	if f.AuthorType != AuthorUser || f.Pinned == nil || !*f.Pinned {
		t.Errorf("authorType %q pinned %v", f.AuthorType, f.Pinned)
	}
	f = mustParams(t, params("author_type", "bot", "pinned", "false"))
	if f.AuthorType != AuthorBot || f.Pinned == nil || *f.Pinned {
		t.Errorf("authorType %q pinned %v", f.AuthorType, f.Pinned)
	}
}

func TestParseSearchParamsRejectsBadValues(t *testing.T) {
	cases := []struct {
		v     url.Values
		field string
	}{
		{params("has", "gif animado"), "has"},
		{params("from", "ana; drop"), "from"},
		{params("mentions", "não"), "mentions"},
		{params("q", "authorType:alien"), "author_type"},
		{params("q", "pinned:talvez"), "pinned"},
		{params("q", "oi", "sort", "random"), "sort"},
		{params("q", "oi", "limit", "0"), "limit"},
		{params("q", "oi", "offset", "-1"), "offset"},
		{params("q", strings.Repeat("a", searchMaxQueryLen+1)), "q"},
		{params("q", strings.Repeat("a ", searchMaxTerms+1)), "q"},
		{params("q", strings.Repeat("a", searchMaxTermLen+1)), "q"},
		{params("from", strings.Repeat("a,", searchMaxValues+1)), "filter"},
	}
	for _, tc := range cases {
		_, err := ParseSearchParams(tc.v)
		var se *SearchError
		if !errors.As(err, &se) || se.Field != tc.field {
			t.Errorf("%v: err = %v, want campo %q", tc.v, err, tc.field)
		}
	}
	// from: aceita o id (uuid) também.
	f := mustParams(t, params("from", "8B1D3C2E-0000-4000-8000-000000000001"))
	if !reflect.DeepEqual(f.From, []string{"8b1d3c2e-0000-4000-8000-000000000001"}) {
		t.Errorf("from uuid = %v", f.From)
	}
}

func TestParseSearchParamsCapsPaging(t *testing.T) {
	f := mustParams(t, params("q", "oi", "limit", "500"))
	if f.Limit != SearchMaxPageSize {
		t.Errorf("limit = %d, want teto %d", f.Limit, SearchMaxPageSize)
	}
	f = mustParams(t, params("q", "oi", "offset", "990", "limit", "50"))
	if f.Offset != 990 || f.Limit != SearchMaxResults-990 {
		t.Errorf("offset %d limit %d: não passa de %d resultados", f.Offset, f.Limit, SearchMaxResults)
	}
	f = mustParams(t, params("q", "oi", "offset", "5000"))
	if f.Limit != 0 {
		t.Errorf("além do teto: limit %d, want 0", f.Limit)
	}
	f = mustParams(t, params("q", "oi", "sort", "relevance"))
	if f.Sort != SortRelevance {
		t.Errorf("sort = %q", f.Sort)
	}
}

func TestSearchFilterEmpty(t *testing.T) {
	if !mustParams(t, params("q", "   from:  ")).Empty() {
		t.Error("sem texto nem filtro devia ser vazio")
	}
	for _, v := range []url.Values{params("q", "oi"), params("has", "link"), params("pinned", "true"), params("after", "2026-01-01"), params("author_type", "bot")} {
		if mustParams(t, v).Empty() {
			t.Errorf("%v não é vazio", v)
		}
	}
}

// Autorização: só entram canais de texto que a pessoa vê e cujo histórico lê.
func TestSearchableChannels(t *testing.T) {
	snap := permission.NewSnapshot("s1", "dono", permission.DefaultEveryone).
		WithRole("vip", 1, 0).
		WithMember("dono").
		WithMember("ana").
		WithMember("vip", "vip").
		WithChannel("geral", permission.ChannelText).
		WithChannel("segredo", permission.ChannelText,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel},
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "vip", Allow: permission.ViewChannel},
		).
		WithChannel("sem-historico", permission.ChannelText,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ReadHistory},
		).
		WithChannel("voz", permission.ChannelVoice)

	cases := map[string][]string{
		"ana":      {"geral"},
		"vip":      {"geral", "segredo"},
		"dono":     {"geral", "segredo", "sem-historico"},
		"estranho": nil,
	}
	for user, want := range cases {
		if got := SearchableChannels(snap, user); !reflect.DeepEqual(got, want) {
			t.Errorf("SearchableChannels(%s) = %v, want %v", user, got, want)
		}
	}
	if SearchableChannels(nil, "ana") != nil {
		t.Error("sem snapshot: nenhum canal")
	}
}

func TestBuildSearchWhere(t *testing.T) {
	pinned := false
	since := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	f := SearchFilter{
		Terms:      []string{"50%_off"},
		From:       []string{"ana"},
		In:         []string{"geral"},
		Has:        []string{HasLink, HasImage, HasFile, HasPoll},
		Mentions:   []string{"bia"},
		Since:      &since,
		AuthorType: AuthorBot,
		Pinned:     &pinned,
	}
	args := &sqlArgs{}
	where := buildSearchWhere(SearchScope{ChannelIDs: []string{"c1"}}, f, args)
	for _, want := range []string{
		"m.channel_id = ANY($1::uuid[])",
		"search_normalize(m.content) LIKE '%' || search_normalize($2::text) || '%'",
		"lower(u.username) = ANY($3::text[])",
		"lower(c.name) = ANY($4::text[])",
		"m.content ~* 'https?://'",
		"a.kind = $5",
		"EXISTS (SELECT 1 FROM message_attachments a WHERE a.message_id = m.id)",
		"FROM polls p",
		"m.content ~* $6",
		"m.created_at >= $7",
		"u.is_bot",
		"NOT EXISTS (SELECT 1 FROM channel_pinned_messages",
	} {
		if !strings.Contains(where, want) {
			t.Errorf("WHERE sem %q:\n%s", want, where)
		}
	}
	// O termo é texto: curingas do LIKE escapados.
	if args.values[1] != `50\%\_off` {
		t.Errorf("termo = %v, want curingas escapados", args.values[1])
	}
	if len(args.values) != 7 {
		t.Errorf("%d argumentos, want 7", len(args.values))
	}

	conv := buildSearchWhere(SearchScope{ConversationID: "x"}, SearchFilter{Terms: []string{"oi"}}, &sqlArgs{})
	if !strings.HasPrefix(conv, notExpired) || !strings.Contains(conv, "m.conversation_id = $1::uuid") || strings.Contains(conv, "channel_id = ANY") {
		t.Errorf("conversa: %s", conv)
	}
}

func TestBuildSearchOrder(t *testing.T) {
	if got := buildSearchOrder(SearchFilter{Sort: SortNewest}, &sqlArgs{}); got != "m.created_at DESC, m.id DESC" {
		t.Errorf("newest = %s", got)
	}
	if got := buildSearchOrder(SearchFilter{Sort: SortOldest}, &sqlArgs{}); got != "m.created_at ASC, m.id ASC" {
		t.Errorf("oldest = %s", got)
	}
	// Relevância sem texto cai na mais nova.
	if got := buildSearchOrder(SearchFilter{Sort: SortRelevance}, &sqlArgs{}); got != "m.created_at DESC, m.id DESC" {
		t.Errorf("relevance sem texto = %s", got)
	}
	args := &sqlArgs{}
	if got := buildSearchOrder(SearchFilter{Sort: SortRelevance, Terms: []string{"bom", "dia"}}, args); !strings.HasPrefix(got, "word_similarity(") || args.values[0] != "bom dia" {
		t.Errorf("relevance = %s (%v)", got, args.values)
	}
}
