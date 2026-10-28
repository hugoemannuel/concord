package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/database"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/ratelimit"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type fakePreviewer struct {
	preview *InvitePreview
	err     error
	codes   []string
	members map[string]bool
}

func (f *fakePreviewer) InvitePreview(_ context.Context, code string) (*InvitePreview, error) {
	f.codes = append(f.codes, code)
	return f.preview, f.err
}

func (f *fakePreviewer) IsMember(_ context.Context, serverID, userID string) (bool, error) {
	return f.members[serverID+"/"+userID], nil
}

// asUser faz o papel do OptionalAuthMiddleware nos testes: o cabeçalho
// X-Test-User vira o userID.
func asUser(c *gin.Context) {
	if id := c.GetHeader("X-Test-User"); id != "" {
		c.Set("userID", id)
	}
	c.Next()
}

func previewRouter(previewer InvitePreviewer, limiter *ratelimit.Limiter) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := &Handler{previews: previewer}
	router := gin.New()
	router.GET("/invites/:id/preview", limitByIP(limiter, "too many requests"), asUser, h.InvitePreview)
	return router
}

func getPreview(router *gin.Engine, code, ip string) *httptest.ResponseRecorder {
	return getPreviewAs(router, code, ip, "")
}

func getPreviewAs(router *gin.Engine, code, ip, userID string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/invites/"+code+"/preview", nil)
	req.RemoteAddr = ip + ":1234"
	if userID != "" {
		req.Header.Set("X-Test-User", userID)
	}
	router.ServeHTTP(w, req)
	return w
}

func jsonKeys(t *testing.T, body []byte) []string {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(body, &m); err != nil {
		t.Fatal(err)
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func TestInvitePreviewReturnsOnlyPublicFields(t *testing.T) {
	icon := "https://exemplo.com/icone.png"
	fake := &fakePreviewer{preview: &InvitePreview{
		ServerID:    "srv-1",
		Name:        "Turma",
		IconURL:     &icon,
		MemberCount: 12,
		OnlineCount: 3,
	}}
	w := getPreview(previewRouter(fake, ratelimit.New(10, time.Minute, 100)), "abcd2345", "203.0.113.1")

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%s)", w.Code, w.Body.String())
	}
	if len(fake.codes) != 1 || fake.codes[0] != "abcd2345" {
		t.Errorf("código repassado = %v, want [abcd2345]", fake.codes)
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	keys := make([]string, 0, len(body))
	for k := range body {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	// Sem login, nem o id do servidor: a página do navegador não precisa dele.
	want := []string{"icon_url", "member_count", "name", "online_count"}
	if len(keys) != len(want) {
		t.Fatalf("campos = %v, want %v", keys, want)
	}
	for i := range want {
		if keys[i] != want[i] {
			t.Fatalf("campos = %v, want %v", keys, want)
		}
	}
	if body["member_count"] != float64(12) || body["online_count"] != float64(3) {
		t.Errorf("contagens = %v/%v, want 12/3", body["member_count"], body["online_count"])
	}
}

func TestInvitePreviewUnknownCodeIs404(t *testing.T) {
	fake := &fakePreviewer{err: ErrInvalidCode}
	w := getPreview(previewRouter(fake, ratelimit.New(10, time.Minute, 100)), "NAOEXISTE", "203.0.113.1")
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

func TestInvitePreviewInternalErrorIs500(t *testing.T) {
	fake := &fakePreviewer{err: errors.New("banco fora")}
	w := getPreview(previewRouter(fake, ratelimit.New(10, time.Minute, 100)), "ABCD2345", "203.0.113.1")
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", w.Code)
	}
	if body := w.Body.String(); body == "" || json.Valid([]byte(body)) == false {
		t.Errorf("body = %q, want JSON", body)
	}
}

func TestInvitePreviewIsRateLimitedPerIP(t *testing.T) {
	fake := &fakePreviewer{err: ErrInvalidCode}
	router := previewRouter(fake, ratelimit.New(2, time.Minute, 100))

	for i := 0; i < 2; i++ {
		if w := getPreview(router, "ABCD2345", "203.0.113.1"); w.Code != http.StatusNotFound {
			t.Fatalf("pedido %d: status = %d, want 404", i+1, w.Code)
		}
	}
	w := getPreview(router, "ABCD2345", "203.0.113.1")
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("3º pedido: status = %d, want 429", w.Code)
	}
	if w.Header().Get("Retry-After") == "" {
		t.Error("429 sem Retry-After")
	}
	if len(fake.codes) != 2 {
		t.Errorf("bloqueado ainda consultou o código: %d consultas", len(fake.codes))
	}
	// Outro IP tem a própria cota.
	if w := getPreview(router, "ABCD2345", "203.0.113.2"); w.Code != http.StatusNotFound {
		t.Fatalf("outro IP: status = %d, want 404", w.Code)
	}
}

func TestValidInviteCode(t *testing.T) {
	for _, code := range []string{"ABCD2345", "K7P2QX9M", "ABCD", "ABCDEFGHJK234567"} {
		if !validInviteCode(code) {
			t.Errorf("validInviteCode(%q) = false, want true", code)
		}
	}
	for _, code := range []string{"", "ABC", "ABCDEFGHJK2345678", "ABCD 2345", "ABCD/2345", "abcd2345", "ÁBCD2345", "ABCD%00"} {
		if validInviteCode(code) {
			t.Errorf("validInviteCode(%q) = true, want false", code)
		}
	}
}

func TestCountOnlineIgnoresOfflineAndInvisible(t *testing.T) {
	statuses := map[string]string{"a": "online", "b": "offline", "c": "idle", "d": "dnd"}
	presence := func(ids []string) map[string]string {
		out := map[string]string{}
		for _, id := range ids {
			if s, ok := statuses[id]; ok {
				out[id] = s
			} else {
				out[id] = "offline"
			}
		}
		return out
	}
	if got := countOnline([]string{"a", "b", "c", "d", "e"}, presence); got != 3 {
		t.Errorf("countOnline = %d, want 3", got)
	}
	if got := countOnline([]string{"a"}, nil); got != 0 {
		t.Errorf("sem presença: countOnline = %d, want 0", got)
	}
}

func TestServiceInvitePreviewRejectsMalformedCodeWithoutDB(t *testing.T) {
	// Sem repositório: um código malformado não pode chegar ao banco.
	s := &Service{}
	for _, code := range []string{"", "x", "ABCD/../2345", "ABCDEFGHJK2345678"} {
		if _, err := s.InvitePreview(context.Background(), code); !errors.Is(err, ErrInvalidCode) {
			t.Errorf("InvitePreview(%q) err = %v, want ErrInvalidCode", code, err)
		}
	}
}

// Num Postgres de verdade (TEST_DATABASE_URL, banco descartável).
func TestInvitePreviewDB(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	ctx := context.Background()
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}

	owner, member, serverID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{owner, member} {
		name := "u" + id[:8]
		exec(`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, name)
	}
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, serverID)
		db.Exec(ctx, `DELETE FROM users WHERE id IN ($1, $2)`, owner, member)
	})
	code := newInviteCode()
	exec(`INSERT INTO servers (id, name, icon_url, owner_id, invite_code) VALUES ($1, 'Turma', 'https://ex.com/i.png', $2, $3)`, serverID, owner, code)
	exec(`INSERT INTO server_members (server_id, user_id) VALUES ($1, $2), ($1, $3)`, serverID, owner, member)

	s := ServerService(ServerRepository(db), nil, nil)
	s.SetPresence(func(ids []string) map[string]string {
		out := map[string]string{}
		for _, id := range ids {
			out[id] = "offline"
		}
		out[member] = "online"
		return out
	})

	p, err := s.InvitePreview(ctx, " "+code[:4]+"-"+code[4:]+" ")
	if err != nil {
		t.Fatal(err)
	}
	if p.ServerID != serverID || p.Name != "Turma" || p.IconURL == nil || *p.IconURL != "https://ex.com/i.png" {
		t.Errorf("preview = %+v", p)
	}
	if p.MemberCount != 2 || p.OnlineCount != 1 {
		t.Errorf("contagens = %d/%d, want 2/1", p.MemberCount, p.OnlineCount)
	}

	if _, err := s.InvitePreview(ctx, "ZZZZZZZZ"); !errors.Is(err, ErrInvalidCode) {
		t.Errorf("código que não existe: err = %v, want ErrInvalidCode", err)
	}
}

// A prévia é pública: as rotas reais registram sem passar pelo login (e sem
// conflitar com as outras rotas de /invites no gin).
func TestInvitePreviewRouteSkipsAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	denyAll := func(c *gin.Context) { c.AbortWithStatus(http.StatusUnauthorized) }
	ServerRoutes(router.Group("/api"), &Handler{previews: &fakePreviewer{err: ErrInvalidCode}}, denyAll, denyAll, func(c *gin.Context) { c.Next() })

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/invites/ABCD2345/preview", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("prévia: status = %d, want 404 (sem login)", w.Code)
	}
	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/invites", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("lista de convites: status = %d, want 401", w.Code)
	}
	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/servers/s1/invite-code/reset", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("gerar novo link: status = %d, want 401", w.Code)
	}
}

// Logado (o modal dentro do app): vem o id do servidor e se a pessoa já é
// membro, para "Você já está neste servidor" / "Abrir servidor".
func TestInvitePreviewLoggedInAddsServerAndMembership(t *testing.T) {
	fake := &fakePreviewer{
		preview: &InvitePreview{ServerID: "srv-1", Name: "Turma", MemberCount: 2},
		members: map[string]bool{"srv-1/ana": true},
	}
	router := previewRouter(fake, ratelimit.New(10, time.Minute, 100))

	w := getPreviewAs(router, "ABCD2345", "203.0.113.1", "ana")
	want := []string{"is_member", "member_count", "name", "online_count", "server_id"}
	if got := jsonKeys(t, w.Body.Bytes()); strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("campos = %v, want %v", got, want)
	}
	var body struct {
		ServerID string `json:"server_id"`
		IsMember bool   `json:"is_member"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.ServerID != "srv-1" || !body.IsMember {
		t.Errorf("ana: %+v, want srv-1 e membro", body)
	}

	w = getPreviewAs(router, "ABCD2345", "203.0.113.1", "bia")
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.ServerID != "srv-1" || body.IsMember {
		t.Errorf("bia: %+v, want srv-1 e não membro", body)
	}
}

func TestPreviewCacheExpiresAndForgetsServer(t *testing.T) {
	now := time.Date(2026, 10, 25, 12, 0, 0, 0, time.UTC)
	cache := newPreviewCache(45*time.Second, 3)
	cache.now = func() time.Time { return now }

	a := &InvitePreview{ServerID: "s1", Name: "A"}
	cache.put("AAAA2222", a)
	if got := cache.get("AAAA2222"); got != a {
		t.Fatalf("get = %v, want o guardado", got)
	}
	// Quem pega não mexe no guardado.
	if got := cache.get("AAAA2222"); got == nil || got.Name != "A" {
		t.Fatalf("get de novo = %v", got)
	}
	now = now.Add(44 * time.Second)
	if cache.get("AAAA2222") == nil {
		t.Fatal("expirou antes da hora")
	}
	now = now.Add(2 * time.Second)
	if cache.get("AAAA2222") != nil {
		t.Fatal("não expirou")
	}

	cache.put("AAAA2222", a)
	cache.put("BBBB3333", &InvitePreview{ServerID: "s2"})
	cache.forgetServer("s1")
	if cache.get("AAAA2222") != nil || cache.get("BBBB3333") == nil {
		t.Fatal("forgetServer tem que tirar só o servidor dado")
	}

	// Cheio: não cresce além do teto.
	for _, code := range []string{"CCCC4444", "DDDD5555", "EEEE6666", "FFFF7777"} {
		cache.put(code, &InvitePreview{ServerID: code})
	}
	if n := cache.len(); n > 3 {
		t.Fatalf("cache com %d entradas, teto 3", n)
	}
}

type denyPerms struct{ err error }

func (d denyPerms) Require(context.Context, string, string, int64) error { return d.err }

// Gerar novo link: só quem tem CREATE_INVITE (sem permissão, nem chega ao banco).
func TestRotateInviteCodeNeedsCreateInvite(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, err := range []error{permission.ErrMissingPermission, permission.ErrNotMember} {
		h := &Handler{perms: denyPerms{err: err}}
		router := gin.New()
		router.POST("/servers/:id/invite-code/reset", func(c *gin.Context) { c.Set("userID", "u1"); c.Next() }, h.RotateInviteCode)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/servers/s1/invite-code/reset", nil))
		if w.Code != http.StatusForbidden {
			t.Errorf("%v: status = %d, want 403", err, w.Code)
		}
	}
}

type recordingPublisher struct {
	codes map[string]string
}

func (*recordingPublisher) PublishServerUpdate(UpdateEvent)     {}
func (*recordingPublisher) PublishServerDelete(DeleteEvent)     {}
func (*recordingPublisher) PublishMemberJoin(MemberJoinEvent)   {}
func (*recordingPublisher) PublishMemberLeave(MemberLeaveEvent) {}
func (*recordingPublisher) PublishMemberUpdate(MemberJoinEvent) {}

func (r *recordingPublisher) PublishInviteCode(serverID, code string) {
	if r.codes == nil {
		r.codes = map[string]string{}
	}
	r.codes[serverID] = code
}

// Num Postgres de verdade: o código novo vale, o antigo morre na hora (sem
// esperar o cache da prévia) e quem pode convidar recebe o novo.
func TestRotateInviteCodeDB(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	ctx := context.Background()
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}

	owner, joiner, serverID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{owner, joiner} {
		name := "u" + id[:8]
		exec(`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, name)
	}
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, serverID)
		db.Exec(ctx, `DELETE FROM users WHERE id IN ($1, $2)`, owner, joiner)
	})
	oldCode := newInviteCode()
	exec(`INSERT INTO servers (id, name, icon_url, owner_id, invite_code) VALUES ($1, 'Turma', '', $2, $3)`, serverID, owner, oldCode)
	exec(`INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)`, serverID, owner)

	pub := &recordingPublisher{}
	s := ServerService(ServerRepository(db), pub, nil)

	// A prévia fica no cache; entrar pelo código atualiza a contagem na hora.
	p, err := s.InvitePreview(ctx, oldCode)
	if err != nil || p.MemberCount != 1 {
		t.Fatalf("prévia = %+v, %v", p, err)
	}
	if _, err := s.JoinByCode(ctx, oldCode, joiner); err != nil {
		t.Fatal(err)
	}
	if p, _ := s.InvitePreview(ctx, oldCode); p == nil || p.MemberCount != 2 {
		t.Fatalf("depois de entrar: %+v, want 2 membros", p)
	}

	newCode, err := s.RotateInviteCode(ctx, serverID, joiner)
	if err != nil {
		t.Fatal(err)
	}
	if newCode == oldCode || !validInviteCode(newCode) || len(newCode) != inviteCodeLength {
		t.Fatalf("código novo %q (antigo %q)", newCode, oldCode)
	}
	if _, err := s.InvitePreview(ctx, oldCode); !errors.Is(err, ErrInvalidCode) {
		t.Errorf("código antigo depois de gerar outro: err = %v, want ErrInvalidCode", err)
	}
	if p, err := s.InvitePreview(ctx, newCode); err != nil || p.ServerID != serverID {
		t.Errorf("código novo: %+v, %v", p, err)
	}
	if got, _ := s.InviteCode(ctx, serverID, owner); got != newCode {
		t.Errorf("InviteCode = %q, want %q", got, newCode)
	}
	if pub.codes[serverID] != newCode {
		t.Errorf("aviso do código novo = %q, want %q", pub.codes[serverID], newCode)
	}
}
