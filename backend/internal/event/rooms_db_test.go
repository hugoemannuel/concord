package event

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/role"
	"gin-quickstart/backend/internal/server"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Estes testes montam a sala com o channel.Service e o cálculo de permissão
// de verdade, contra o Postgres, para provar quem vê e quem não vê a sala.

type roomWorld struct {
	ctx         context.Context
	db          *pgxpool.Pool
	repo        *Repository
	rooms       *Rooms
	permissions *permission.Service
	servers     *server.Repository
	calls       *fakeCalls
}

func newRoomWorld(t *testing.T) roomWorld {
	t.Helper()
	db, ctx := eventDB(t)
	servers := server.ServerRepository(db)
	perms := permission.PermissionService(permission.PermissionRepository(db))
	servers.SetPermissionCache(perms)
	channels := channel.ChannelService(channel.ChannelRepository(db), nil)
	channels.SetPermissionCache(perms)
	repo := NewRepository(db)
	calls := &fakeCalls{}
	return roomWorld{
		ctx: ctx, db: db, repo: repo, permissions: perms, servers: servers, calls: calls,
		rooms: NewRooms(channels, perms, calls, repo),
	}
}

// newServer cria um servidor com os cargos padrão (o dono é o primeiro membro).
func (w roomWorld) newServer(t *testing.T) (ownerID, serverID string) {
	t.Helper()
	ownerID = w.newUser(t)
	srv := &server.Server{Name: "Salinha", OwnerID: ownerID}
	if err := server.ServerService(w.servers, nil, role.RoleRepository(w.db)).Create(w.ctx, srv); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = w.db.Exec(w.ctx, `DELETE FROM servers WHERE id = $1`, srv.ID) })
	return ownerID, srv.ID
}

func (w roomWorld) newUser(t *testing.T) string {
	t.Helper()
	id := uuid.NewString()
	mustExec(t, w.db, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2, $2, $3, 'x')`,
		id, "u"+id[:8], id[:8]+"@teste.dev")
	t.Cleanup(func() { _, _ = w.db.Exec(w.ctx, `DELETE FROM users WHERE id = $1`, id) })
	return id
}

func (w roomWorld) join(t *testing.T, serverID, userID string) {
	t.Helper()
	if err := w.servers.AddingUserServer(w.ctx, &server.Server{ID: serverID}, &server.ServerMember{}, userID, "member"); err != nil {
		t.Fatal(err)
	}
}

func (w roomWorld) can(t *testing.T, channelID, userID string, bits int64) bool {
	t.Helper()
	perms, err := w.permissions.ChannelPerms(w.ctx, channelID, userID)
	if err != nil {
		t.Fatal(err)
	}
	return permission.Has(perms, bits)
}

func (w roomWorld) channelCount(t *testing.T, ids ...string) int {
	t.Helper()
	var n int
	if err := w.db.QueryRow(w.ctx, `SELECT COUNT(*) FROM channels WHERE id = ANY($1)`, ids).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestRoomLifecycleWithRealChannelsAndPermissions(t *testing.T) {
	w := newRoomWorld(t)
	owner, serverID := w.newServer(t)
	organizer, going, outsider, late := w.newUser(t), w.newUser(t), w.newUser(t), w.newUser(t)
	for _, id := range []string{organizer, going, outsider, late} {
		w.join(t, serverID, id)
	}
	start := time.Now().Add(-time.Minute).Truncate(time.Second)
	e := newTestEvent(serverID, organizer, start)
	e.Title = "Noite de jogos"
	if err := w.repo.Create(w.ctx, e, nil); err != nil {
		t.Fatal(err)
	}
	if err := w.repo.SetRSVP(w.ctx, e.ID, going, start, true); err != nil {
		t.Fatal(err)
	}

	req := RoomRequest{EventID: e.ID, ServerID: serverID, Title: e.Title, Occurrence: start, CreatedBy: &organizer}
	if err := w.rooms.Open(w.ctx, req, []string{going}); err != nil {
		t.Fatal(err)
	}
	opened, err := w.repo.Find(w.ctx, serverID, e.ID)
	if err != nil || opened.VoiceChannelID == nil || opened.TextChannelID == nil {
		t.Fatalf("a sala devia estar gravada no evento: %+v err=%v", opened, err)
	}
	voice, text := *opened.VoiceChannelID, *opened.TextChannelID

	// Quem confirmou e o organizador veem e entram; quem não confirmou não vê nada.
	for _, id := range []string{voice, text} {
		if !w.can(t, id, going, permission.ViewChannel) || !w.can(t, id, organizer, permission.ViewChannel) {
			t.Fatalf("canal %s: quem confirmou e o organizador precisam ver", id)
		}
		if w.can(t, id, outsider, permission.ViewChannel) {
			t.Fatalf("canal %s: quem não confirmou não pode ver", id)
		}
		if !w.can(t, id, owner, permission.ViewChannel) {
			t.Fatalf("canal %s: o dono do servidor vê tudo", id)
		}
	}
	if !w.can(t, voice, going, permission.Connect) || !w.can(t, voice, going, permission.Speak) {
		t.Error("quem confirmou conecta e fala na voz")
	}
	if w.can(t, voice, outsider, permission.Connect) {
		t.Error("quem não confirmou não conecta na voz")
	}

	// Os dois canais são "gerenciados": só o evento os apaga, e o texto não vira canal principal.
	var managed int
	if err := w.db.QueryRow(w.ctx, `SELECT COUNT(*) FROM channels WHERE id IN ($1, $2) AND managed`, voice, text).Scan(&managed); err != nil || managed != 2 {
		t.Fatalf("canais gerenciados = %d err=%v, esperava os 2", managed, err)
	}
	if err := w.servers.SetPrimaryChannel(w.ctx, serverID, text); !errors.Is(err, server.ErrInvalidPrimaryChannel) {
		t.Fatalf("o chat da sala não pode ser o canal principal: %v", err)
	}

	// Confirmar depois que a sala abriu libera; desistir tira. O organizador fica.
	w.rooms.Allow(w.ctx, opened, late, true)
	if !w.can(t, voice, late, permission.Connect) || !w.can(t, text, late, permission.ViewChannel) {
		t.Fatal("quem confirmou depois precisa entrar na sala")
	}
	w.rooms.Allow(w.ctx, opened, late, false)
	if w.can(t, voice, late, permission.ViewChannel) || w.can(t, text, late, permission.ViewChannel) {
		t.Fatal("quem desistiu perde o acesso")
	}
	w.rooms.Allow(w.ctx, opened, organizer, false)
	if !w.can(t, voice, organizer, permission.ViewChannel) {
		t.Fatal("o organizador nunca perde o acesso")
	}

	// Fechar derruba a chamada, apaga os dois canais e zera a sala do evento.
	ref := RoomRef{EventID: e.ID, ServerID: serverID, VoiceID: &voice, TextID: &text}
	if err := w.rooms.Close(w.ctx, ref); err != nil {
		t.Fatal(err)
	}
	if len(w.calls.closed) != 1 || w.calls.closed[0] != serverID+"|"+voice {
		t.Errorf("chamada fechada = %v", w.calls.closed)
	}
	if n := w.channelCount(t, voice, text); n != 0 {
		t.Errorf("sobraram %d canais da sala", n)
	}
	closed, _ := w.repo.Find(w.ctx, serverID, e.ID)
	if closed.VoiceChannelID != nil || closed.TextChannelID != nil {
		t.Errorf("a sala do evento devia estar zerada: %+v", closed)
	}
}

func TestOpenTwiceForTheSameTitleGetsDistinctNames(t *testing.T) {
	w := newRoomWorld(t)
	owner, serverID := w.newServer(t)
	start := time.Now().Add(-time.Minute).Truncate(time.Second)
	var names []string
	for i := 0; i < 2; i++ {
		e := newTestEvent(serverID, owner, start)
		e.Title = "Noite"
		if err := w.repo.Create(w.ctx, e, nil); err != nil {
			t.Fatal(err)
		}
		req := RoomRequest{EventID: e.ID, ServerID: serverID, Title: e.Title, Occurrence: start, CreatedBy: &owner}
		if err := w.rooms.Open(w.ctx, req, nil); err != nil {
			t.Fatalf("sala %d: %v", i, err)
		}
		got, _ := w.repo.Find(w.ctx, serverID, e.ID)
		var name string
		_ = w.db.QueryRow(w.ctx, `SELECT name FROM channels WHERE id = $1`, *got.VoiceChannelID).Scan(&name)
		names = append(names, name)
	}
	if names[0] == names[1] || names[0] != "evento-noite" {
		t.Errorf("nomes = %v: o segundo evento de mesmo título precisa de nome diferente", names)
	}
}

// O ciclo todo pelo agendador, com banco, canais e permissões de verdade: o
// evento começa, a sala abre e o aviso diz onde entrar; a duração acaba, a sala
// some e o evento passa para a semana seguinte.
func TestSchedulerRunsTheWholeRoomCycle(t *testing.T) {
	w := newRoomWorld(t)
	owner, serverID := w.newServer(t)
	going, outsider := w.newUser(t), w.newUser(t)
	w.join(t, serverID, going)
	w.join(t, serverID, outsider)

	start := time.Now().Add(-time.Minute).Truncate(time.Second)
	e := newTestEvent(serverID, owner, start)
	e.Title, e.DurationMinutes = "Noite de jogos", 30
	if err := w.repo.Create(w.ctx, e, reminderRows(start, nil, time.Now())); err != nil {
		t.Fatal(err)
	}
	if err := w.repo.SetRSVP(w.ctx, e.ID, going, start, true); err != nil {
		t.Fatal(err)
	}

	notifier := &fakeNotifier{}
	sched := NewScheduler(w.repo, notifier, w.rooms, nil)
	now := time.Now()
	sched.now = func() time.Time { return now }

	sched.tick(w.ctx)
	running, err := w.repo.Find(w.ctx, serverID, e.ID)
	if err != nil || running.VoiceChannelID == nil || running.TextChannelID == nil {
		t.Fatalf("a sala devia ter aberto na hora do início: %+v err=%v", running, err)
	}
	voice, text := *running.VoiceChannelID, *running.TextChannelID
	if !w.can(t, voice, going, permission.Connect) || w.can(t, voice, outsider, permission.ViewChannel) {
		t.Fatal("só quem confirmou entra na sala")
	}
	msgs := notifier.sent[going]
	if len(msgs) != 1 || !strings.Contains(msgs[0], "Entre na sala #evento-noite-de-jogos") {
		t.Fatalf("o aviso do começo devia dizer onde entrar: %v", msgs)
	}
	if len(notifier.sent[outsider]) != 0 {
		t.Fatalf("quem não confirmou não recebe aviso: %v", notifier.sent[outsider])
	}
	if running.OccurrencesDone != 0 {
		t.Fatal("durante o evento ele não avança")
	}

	now = now.Add(31 * time.Minute) // a duração de 30 min acabou
	sched.tick(w.ctx)
	if n := w.channelCount(t, voice, text); n != 0 {
		t.Fatalf("a sala devia ter sido apagada, sobraram %d canais", n)
	}
	if len(w.calls.closed) != 1 || w.calls.closed[0] != serverID+"|"+voice {
		t.Errorf("a chamada devia ter sido derrubada: %v", w.calls.closed)
	}
	next, err := w.repo.Find(w.ctx, serverID, e.ID)
	if err != nil {
		t.Fatal(err)
	}
	if next.VoiceChannelID != nil || next.TextChannelID != nil || next.OccurrencesDone != 1 || !next.NextStartAt.Equal(start.AddDate(0, 0, 7)) {
		t.Fatalf("o evento devia ir para a semana seguinte sem sala: %+v", next)
	}
}
