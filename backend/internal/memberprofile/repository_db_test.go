package memberprofile_test

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	"gin-quickstart/backend/internal/memberprofile"
	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/namestyle"
	"gin-quickstart/backend/internal/server"
	"gin-quickstart/backend/internal/user"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Num Postgres de verdade (TEST_DATABASE_URL, banco descartável já migrado):
// resolução por campo, isolamento, cascata, caixa de saída, mídia em uso,
// consulta em lote sem N+1 e "sem perfil nada muda".

// queryCounter conta as consultas do pool (lista em lote = uma consulta só).
type queryCounter struct{ n atomic.Int64 }

func (q *queryCounter) TraceQueryStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryStartData) context.Context {
	q.n.Add(1)
	return ctx
}
func (q *queryCounter) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

func openDB(t *testing.T) (*pgxpool.Pool, *queryCounter) {
	t.Helper()
	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	cfg, err := pgxpool.ParseConfig(raw)
	if err != nil {
		t.Fatal(err)
	}
	counter := &queryCounter{}
	cfg.ConnConfig.Tracer = counter
	db, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	var exists bool
	if err := db.QueryRow(context.Background(), `SELECT to_regclass('server_member_profiles') IS NOT NULL`).Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if !exists {
		t.Skip("banco sem a migration 000192")
	}
	return db, counter
}

func mustExec(t *testing.T, db *pgxpool.Pool, sql string, args ...any) {
	t.Helper()
	if _, err := db.Exec(context.Background(), sql, args...); err != nil {
		t.Fatal(err)
	}
}

func newUser(t *testing.T, db *pgxpool.Pool) string {
	t.Helper()
	id := uuid.NewString()
	name := "t" + strings.ReplaceAll(id, "-", "")[:12]
	mustExec(t, db, `INSERT INTO users (id, username, display_name, email, password_hash, avatar_url) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x', $3)`, id, name, "/api/profile-media/global-"+id)
	t.Cleanup(func() { db.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, id) })
	return id
}

func newServer(t *testing.T, db *pgxpool.Pool, owner string, members ...string) string {
	t.Helper()
	id := uuid.NewString()
	mustExec(t, db, `INSERT INTO servers (id, name, owner_id) VALUES ($1, 'teste', $2)`, id, owner)
	t.Cleanup(func() { db.Exec(context.Background(), `DELETE FROM servers WHERE id = $1`, id) })
	for _, m := range append([]string{owner}, members...) {
		mustExec(t, db, `INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)`, id, m)
	}
	return id
}

func setBio(t *testing.T, repo *memberprofile.Repository, serverID, userID, bio string) {
	t.Helper()
	err := repo.Mutate(context.Background(), serverID, userID, func(o *memberprofile.Overrides) error {
		o.Bio = &bio
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func setAvatar(t *testing.T, repo *memberprofile.Repository, serverID, userID, url string) {
	t.Helper()
	err := repo.Mutate(context.Background(), serverID, userID, func(o *memberprofile.Overrides) error {
		o.AvatarURL = &url
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func memberOf(t *testing.T, repo *server.Repository, serverID, userID string) server.ServerMember {
	t.Helper()
	list, err := repo.ListMembers(context.Background(), serverID)
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range list {
		if m.UserID == userID {
			return m
		}
	}
	t.Fatalf("membro %s não está na lista", userID)
	return server.ServerMember{}
}

func TestMutateGravaTudoEVolta(t *testing.T) {
	db, _ := openDB(t)
	ctx := context.Background()
	repo := memberprofile.NewRepository(db)
	me := newUser(t, db)
	srv := newServer(t, db, me)

	bio, color := "oi", "#112233"
	links := []user.ProfileLink{{URL: "https://a.co"}}
	style := namestyle.Default()
	err := repo.Mutate(ctx, srv, me, func(o *memberprofile.Overrides) error {
		o.Bio, o.BannerColor, o.Links, o.NameStyle = &bio, &color, &links, &style
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	got, err := repo.Find(ctx, srv, me)
	if err != nil {
		t.Fatal(err)
	}
	if *got.Bio != bio || *got.BannerColor != color || (*got.Links)[0].URL != "https://a.co" || got.NameStyle == nil {
		t.Fatalf("%+v", got)
	}
	if got.Pronouns != nil || got.AvatarURL != nil {
		t.Fatalf("o resto herda: %+v", got)
	}

	// Sem campo sobrando, a linha some.
	err = repo.Mutate(ctx, srv, me, func(o *memberprofile.Overrides) error {
		*o = memberprofile.Overrides{}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	var count int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM server_member_profiles WHERE server_id = $1`, srv).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("linha vazia ficou")
	}
}

func TestQuemNaoEMembroNaoGrava(t *testing.T) {
	db, _ := openDB(t)
	repo := memberprofile.NewRepository(db)
	owner, outsider := newUser(t, db), newUser(t, db)
	srv := newServer(t, db, owner)
	bio := "x"
	err := repo.Mutate(context.Background(), srv, outsider, func(o *memberprofile.Overrides) error {
		o.Bio = &bio
		return nil
	})
	if err == nil || !strings.Contains(err.Error(), memberprofile.ErrNotMember.Error()) {
		t.Fatalf("esperava não membro: %v", err)
	}
}

// Lista de membros: uma consulta só, efetivos por pessoa, isolado por servidor.
func TestListaDeMembrosEmLote(t *testing.T) {
	db, counter := openDB(t)
	repo := memberprofile.NewRepository(db)
	servers := server.ServerRepository(db)
	ana, bia, caio := newUser(t, db), newUser(t, db), newUser(t, db)
	s1 := newServer(t, db, ana, bia, caio)
	s2 := newServer(t, db, ana, bia)

	setAvatar(t, repo, s1, ana, "/api/profile-media/ana-s1")
	setBio(t, repo, s1, bia, "bio da bia")

	counter.n.Store(0)
	list, err := servers.ListMembers(context.Background(), s1)
	if err != nil {
		t.Fatal(err)
	}
	if n := counter.n.Load(); n != 1 {
		t.Fatalf("N+1: %d consultas para a lista", n)
	}
	if len(list) != 3 {
		t.Fatalf("%d membros", len(list))
	}

	a := memberOf(t, servers, s1, ana)
	if *a.AvatarURL != "/api/profile-media/ana-s1" || a.MemberProfile == nil || *a.MemberProfile.AvatarURL != "/api/profile-media/ana-s1" {
		t.Fatalf("sobrescreve: %+v", a)
	}
	b := memberOf(t, servers, s1, bia)
	if *b.AvatarURL != "/api/profile-media/global-"+bia {
		t.Fatalf("campo sem sobrescrever herda: %v", *b.AvatarURL)
	}
	if b.MemberProfile == nil || *b.MemberProfile.Bio != "bio da bia" {
		t.Fatalf("%+v", b.MemberProfile)
	}
	if c := memberOf(t, servers, s1, caio); c.MemberProfile != nil || *c.AvatarURL != "/api/profile-media/global-"+caio {
		t.Fatalf("sem perfil nada muda: %+v", c)
	}
	if other := memberOf(t, servers, s2, ana); other.MemberProfile != nil || *other.AvatarURL != "/api/profile-media/global-"+ana {
		t.Fatalf("isolamento entre servidores: %+v", other)
	}

	one, err := servers.FindMemberByUserID(context.Background(), s1, ana)
	if err != nil {
		t.Fatal(err)
	}
	if *one.AvatarURL != "/api/profile-media/ana-s1" || one.MemberProfile == nil {
		t.Fatalf("um membro só: %+v", one)
	}
}

// Sem perfil do servidor o JSON do membro continua como antes: sem member_profile.
func TestMembroSemPerfilNaoGanhaCampo(t *testing.T) {
	db, _ := openDB(t)
	servers := server.ServerRepository(db)
	ana := newUser(t, db)
	srv := newServer(t, db, ana)
	raw, err := json.Marshal(memberOf(t, servers, srv, ana))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "member_profile") {
		t.Fatalf("%s", raw)
	}
}

func TestFaixaEfetiva(t *testing.T) {
	db, _ := openDB(t)
	ctx := context.Background()
	repo := memberprofile.NewRepository(db)
	servers := server.ServerRepository(db)
	ana := newUser(t, db)
	srv := newServer(t, db, ana)
	mustExec(t, db, `UPDATE users SET nameplate_mode = 'banner', banner_url = '/api/profile-media/banner-global' WHERE id = $1`, ana)

	if m := memberOf(t, servers, srv, ana); *m.NameplateURL != "/api/profile-media/banner-global" {
		t.Fatalf("global: %+v", m.Look)
	}

	// O banner do servidor entra na faixa de quem usa o banner como faixa.
	banner := "/api/profile-media/banner-s"
	if err := repo.Mutate(ctx, srv, ana, func(o *memberprofile.Overrides) error { o.BannerURL = &banner; return nil }); err != nil {
		t.Fatal(err)
	}
	m := memberOf(t, servers, srv, ana)
	if *m.NameplateURL != banner || *m.MemberProfile.NameplateURL != banner {
		t.Fatalf("banner do servidor: %+v / %+v", m.Look, m.MemberProfile)
	}

	// "off" esconde só neste servidor.
	off := "off"
	if err := repo.Mutate(ctx, srv, ana, func(o *memberprofile.Overrides) error { o.NameplateMode = &off; return nil }); err != nil {
		t.Fatal(err)
	}
	m = memberOf(t, servers, srv, ana)
	if m.NameplateURL != nil || m.MemberProfile.NameplateURL != nil {
		t.Fatalf("off: %+v", m.Look)
	}

	// Imagem própria: a pessoa vê; a lista dos outros só vê a faixa efetiva.
	custom, mode := "/api/profile-media/faixa", "custom"
	if err := repo.Mutate(ctx, srv, ana, func(o *memberprofile.Overrides) error {
		o.NameplateMode, o.NameplateCustomURL = &mode, &custom
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	found, err := repo.Find(ctx, srv, ana)
	if err != nil {
		t.Fatal(err)
	}
	if *found.NameplateCustomURL != custom || *found.NameplateURL != custom {
		t.Fatalf("%+v", found)
	}
	if m := memberOf(t, servers, srv, ana); *m.NameplateURL != custom {
		t.Fatalf("%+v", m.Look)
	}
}

// Sair, ser expulso e apagar a conta ou o servidor levam o perfil e guardam os
// arquivos na caixa de saída.
func TestCascataGuardaArquivos(t *testing.T) {
	db, _ := openDB(t)
	ctx := context.Background()
	repo := memberprofile.NewRepository(db)
	servers := server.ServerRepository(db)
	owner, leaver, deleted := newUser(t, db), newUser(t, db), newUser(t, db)
	srv := newServer(t, db, owner, leaver, deleted)
	gone := newServer(t, db, owner)

	leaverURL := "/api/profile-media/" + uuid.NewString()
	deletedURL := "/api/profile-media/" + uuid.NewString()
	serverURL := "/api/profile-media/" + uuid.NewString()
	setAvatar(t, repo, srv, leaver, leaverURL)
	setAvatar(t, repo, srv, deleted, deletedURL)
	setAvatar(t, repo, gone, owner, serverURL)
	if _, err := repo.TakeTrash(ctx); err != nil {
		t.Fatal(err)
	}

	if err := servers.RemoveMember(ctx, srv, leaver); err != nil {
		t.Fatal(err)
	}
	mustExec(t, db, `DELETE FROM users WHERE id = $1`, deleted)
	mustExec(t, db, `DELETE FROM servers WHERE id = $1`, gone)

	urls, err := repo.TakeTrash(ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]bool{leaverURL: false, deletedURL: false, serverURL: false}
	for _, u := range urls {
		if _, ok := want[u]; ok {
			want[u] = true
		}
	}
	for u, seen := range want {
		if !seen {
			t.Errorf("%s não foi para a caixa de saída (veio %v)", u, urls)
		}
	}
	if view, err := repo.Find(ctx, srv, leaver); err != nil || !view.Empty() {
		t.Fatalf("perfil ficou: %+v %v", view, err)
	}

	// Voltar ao servidor começa do zero.
	mustExec(t, db, `INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)`, srv, leaver)
	if m := memberOf(t, servers, srv, leaver); m.MemberProfile != nil {
		t.Fatalf("voltou com o perfil antigo: %+v", m.MemberProfile)
	}
}

func TestBanLevaOPerfil(t *testing.T) {
	db, _ := openDB(t)
	ctx := context.Background()
	repo := memberprofile.NewRepository(db)
	servers := server.ServerRepository(db)
	owner, target := newUser(t, db), newUser(t, db)
	srv := newServer(t, db, owner, target)
	setBio(t, repo, srv, target, "tchau")
	if err := servers.BanMember(ctx, srv, target, owner, nil); err != nil {
		t.Fatal(err)
	}
	if view, err := repo.Find(ctx, srv, target); err != nil || !view.Empty() {
		t.Fatalf("%+v %v", view, err)
	}
}

func TestMediaInUse(t *testing.T) {
	db, _ := openDB(t)
	ctx := context.Background()
	repo := memberprofile.NewRepository(db)
	ana := newUser(t, db)
	srv := newServer(t, db, ana)
	urls := map[string]func(o *memberprofile.Overrides, u *string){
		"avatar":  func(o *memberprofile.Overrides, u *string) { o.AvatarURL = u },
		"banner":  func(o *memberprofile.Overrides, u *string) { o.BannerURL = u },
		"faixa":   func(o *memberprofile.Overrides, u *string) { o.NameplateCustomURL = u },
		"moldura": func(o *memberprofile.Overrides, u *string) { o.AvatarDecorationURL = u },
	}
	for name, set := range urls {
		url := "/api/profile-media/" + uuid.NewString()
		if used, err := repo.MediaInUse(ctx, url); err != nil || used {
			t.Fatalf("%s antes: %v %v", name, used, err)
		}
		err := repo.Mutate(ctx, srv, ana, func(o *memberprofile.Overrides) error {
			set(o, &url)
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
		if used, err := repo.MediaInUse(ctx, url); err != nil || !used {
			t.Fatalf("%s depois: %v %v", name, used, err)
		}
	}
}

// Mensagens: no servidor, o autor e quem foi respondido vêm com o perfil de lá;
// em outro servidor e em DM, com o global.
func TestMensagensUsamOPerfilDoServidorDoCanal(t *testing.T) {
	db, _ := openDB(t)
	ctx := context.Background()
	repo := memberprofile.NewRepository(db)
	messages := message.MessageRepository(db)
	ana, bia := newUser(t, db), newUser(t, db)
	s1 := newServer(t, db, ana, bia)
	s2 := newServer(t, db, ana, bia)
	ch1, ch2 := uuid.NewString(), uuid.NewString()
	mustExec(t, db, `INSERT INTO channels (id, server_id, name, created_by) VALUES ($1, $2, 'a', $3), ($4, $5, 'b', $3)`, ch1, s1, ana, ch2, s2)

	setAvatar(t, repo, s1, ana, "/api/profile-media/ana-s1")
	setAvatar(t, repo, s1, bia, "/api/profile-media/bia-s1")

	create := func(channel, author string, replyTo *string) string {
		id := uuid.NewString()
		msg := &message.Message{ID: id, AuthorID: author, ChannelID: &channel, Content: "oi", ReplyToID: replyTo}
		if err := messages.Create(ctx, msg); err != nil {
			t.Fatal(err)
		}
		return id
	}
	first := create(ch1, bia, nil)
	reply := create(ch1, ana, &first)
	outside := create(ch2, ana, nil)

	got, err := messages.FindByID(ctx, reply)
	if err != nil {
		t.Fatal(err)
	}
	if *got.Author.AvatarURL != "/api/profile-media/ana-s1" {
		t.Fatalf("autor: %v", *got.Author.AvatarURL)
	}
	if *got.ReplyTo.Author.AvatarURL != "/api/profile-media/bia-s1" {
		t.Fatalf("respondido: %v", *got.ReplyTo.Author.AvatarURL)
	}

	got, err = messages.FindByID(ctx, outside)
	if err != nil {
		t.Fatal(err)
	}
	if *got.Author.AvatarURL != "/api/profile-media/global-"+ana {
		t.Fatalf("outro servidor usa o global: %v", *got.Author.AvatarURL)
	}
}
