package channelcategory

import (
	"context"
	"errors"
	"os"
	"reflect"
	"sync"
	"testing"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/platform/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func categoryTestDB(t *testing.T) (*pgxpool.Pool, context.Context) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
	return db, context.Background()
}

func TestRepositoryLayout(t *testing.T) {
	db, ctx := categoryTestDB(t)
	owner, server, other := uuid.NewString(), uuid.NewString(), uuid.NewString()
	_, err := db.Exec(ctx, `INSERT INTO users(id,username,display_name,email,password_hash) VALUES($1,$2,$2,$3,'x')`, owner, "c"+owner[:8], owner[:8]+"@teste.dev")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner) })
	_, err = db.Exec(ctx, `INSERT INTO servers(id,name,owner_id) VALUES($1,'um',$3),($2,'dois',$3)`, server, other, owner)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM servers WHERE id IN ($1,$2)`, server, other) })
	ids := []string{uuid.NewString(), uuid.NewString(), uuid.NewString()}
	for i, id := range ids {
		_, err = db.Exec(ctx, `INSERT INTO channels(id,server_id,name,type,position,created_by) VALUES($1,$2,$3,'text',$4,$5)`, id, server, id, i, owner)
		if err != nil {
			t.Fatal(err)
		}
	}
	repo := NewRepository(db)
	if _, err = repo.Create(ctx, server, "Jogos", nil); err != nil {
		t.Fatal(err)
	}
	if _, err = repo.Create(ctx, other, "Outro", nil); err != nil {
		t.Fatal(err)
	}
	layout, err := repo.List(ctx, server)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Categories) != 1 || len(layout.Channels) != 3 {
		t.Fatalf("layout: %+v", layout)
	}
	cat := layout.Categories[0].ID
	t.Run("cria canal já na categoria", func(t *testing.T) {
		channels := channel.ChannelRepository(db)
		for _, kind := range []string{channel.TypeText, channel.TypeVoice} {
			ch := &channel.Channel{ID: uuid.NewString(), ServerID: server, Name: "novo-" + kind, Type: kind, CreatedBy: owner, CategoryID: &cat}
			if err := channels.Create(ctx, ch, nil); err != nil {
				t.Fatal(err)
			}
			var got string
			if err := db.QueryRow(ctx, `SELECT category_id::text FROM channel_category_layout WHERE channel_id=$1`, ch.ID).Scan(&got); err != nil || got != cat {
				t.Fatalf("categoria=%s erro=%v", got, err)
			}
			if err := channels.Delete(ctx, ch.ID); err != nil {
				t.Fatal(err)
			}
		}
	})
	foreign, err := repo.List(ctx, other)
	if err != nil {
		t.Fatal(err)
	}
	t.Run("categoria inválida reverte a criação do canal", func(t *testing.T) {
		invalid := foreign.Categories[0].ID
		ch := &channel.Channel{ID: uuid.NewString(), ServerID: server, Name: "não-criar", Type: channel.TypeText, CreatedBy: owner, CategoryID: &invalid}
		if err := channel.ChannelRepository(db).Create(ctx, ch, nil); err == nil {
			t.Fatal("aceitou categoria de outro servidor")
		}
		var count int
		if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM channels WHERE id=$1`, ch.ID).Scan(&count); err != nil || count != 0 {
			t.Fatalf("canal persistido=%d erro=%v", count, err)
		}
	})
	if err := repo.MoveChannel(ctx, server, ids[0], &foreign.Categories[0].ID, nil); err == nil {
		t.Fatal("aceitou categoria de outro servidor")
	}
	if err := repo.MoveChannel(ctx, server, ids[0], &cat, nil); err != nil {
		t.Fatal(err)
	}
	if err := repo.MoveChannel(ctx, server, ids[1], &cat, &ids[0]); err != nil {
		t.Fatal(err)
	}
	layout, err = repo.List(ctx, server)
	if err != nil {
		t.Fatal(err)
	}
	var grouped []string
	for _, ch := range layout.Channels {
		if ch.CategoryID != nil && *ch.CategoryID == cat {
			grouped = append(grouped, ch.ChannelID)
		}
	}
	if len(grouped) != 2 || grouped[0] != ids[1] || grouped[1] != ids[0] {
		t.Fatalf("ordem: %v", grouped)
	}
	if _, err := repo.Delete(ctx, server, cat); err != nil {
		t.Fatal(err)
	}
	layout, err = repo.List(ctx, server)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Channels) != 3 {
		t.Fatalf("canais perdidos: %+v", layout)
	}
	for _, ch := range layout.Channels {
		if ch.CategoryID != nil {
			t.Fatalf("categoria não removida: %+v", ch)
		}
	}
}

// layoutScene: servidor com duas categorias (a e b) e três canais visíveis,
// mais um canal "oculto" para quem usa canViewAllButHidden.
type layoutScene struct {
	repo                  *Repository
	ctx                   context.Context
	server, other         string
	a, b, foreignCategory string
	free, inA, inB        string
	hidden, foreignCh     string
}

func newLayoutScene(t *testing.T) *layoutScene {
	t.Helper()
	db, ctx := categoryTestDB(t)
	owner, server, other := uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO users(id,username,display_name,email,password_hash) VALUES($1,$2,$2,$3,'x')`, owner, "l"+owner[:8], owner[:8]+"@teste.dev")
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner) })
	exec(`INSERT INTO servers(id,name,owner_id) VALUES($1,'um',$3),($2,'dois',$3)`, server, other, owner)
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM servers WHERE id IN ($1,$2)`, server, other) })
	scene := &layoutScene{repo: NewRepository(db), ctx: ctx, server: server, other: other}
	scene.free, scene.inA, scene.inB, scene.hidden, scene.foreignCh = uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	for i, id := range []string{scene.free, scene.inA, scene.hidden, scene.inB} {
		exec(`INSERT INTO channels(id,server_id,name,type,position,created_by) VALUES($1,$2,$5,'text',$3,$4)`, id, server, i, owner, "c"+id[:8])
	}
	exec(`INSERT INTO channels(id,server_id,name,type,position,created_by) VALUES($1,$2,'fora','voice',0,$3)`, scene.foreignCh, other, owner)
	for _, name := range []string{"a", "b"} {
		if _, err := scene.repo.Create(ctx, server, name, nil); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := scene.repo.Create(ctx, other, "fora", nil); err != nil {
		t.Fatal(err)
	}
	layout := scene.layout(t)
	scene.a, scene.b = layout.Categories[0].ID, layout.Categories[1].ID
	foreign, err := scene.repo.List(ctx, other)
	if err != nil {
		t.Fatal(err)
	}
	scene.foreignCategory = foreign.Categories[0].ID
	for _, move := range []struct {
		channel  string
		category *string
	}{{scene.inA, &scene.a}, {scene.hidden, &scene.a}, {scene.inB, &scene.b}} {
		if err := scene.repo.MoveChannel(ctx, server, move.channel, move.category, nil); err != nil {
			t.Fatal(err)
		}
	}
	return scene
}

func (s *layoutScene) layout(t *testing.T) Layout {
	t.Helper()
	layout, err := s.repo.List(s.ctx, s.server)
	if err != nil {
		t.Fatal(err)
	}
	return layout
}

func (s *layoutScene) viewer() Viewer {
	return Viewer{
		Channel:  func(channel string) bool { return channel != s.hidden },
		Category: func(string) bool { return true },
	}
}

func (s *layoutScene) revision(t *testing.T) string {
	t.Helper()
	return layoutRevision(visibleLayout(s.layout(t), s.viewer()))
}

func (s *layoutScene) group(t *testing.T, category *string) []string {
	t.Helper()
	ids := []string{}
	for _, placement := range s.layout(t).Channels {
		if categoryKey(placement.CategoryID) == categoryKey(category) {
			ids = append(ids, placement.ChannelID)
		}
	}
	return ids
}

func TestSaveLayoutWritesFinalOrder(t *testing.T) {
	s := newLayoutScene(t)
	result, err := s.repo.SaveLayout(s.ctx, s.server, LayoutWrite{
		Revision:   s.revision(t),
		Categories: []string{s.b, s.a},
		Channels: []Placement{
			{ChannelID: s.inB, CategoryID: nil, Position: 0},
			{ChannelID: s.free, CategoryID: &s.b, Position: 0},
			{ChannelID: s.inA, CategoryID: &s.b, Position: 1},
		},
	}, s.viewer())
	if err != nil {
		t.Fatal(err)
	}
	if !result.Changed || result.Revision != s.revision(t) {
		t.Fatalf("resultado %+v, revisão gravada %s", result, s.revision(t))
	}
	if got := []string{s.layout(t).Categories[0].ID, s.layout(t).Categories[1].ID}; !reflect.DeepEqual(got, []string{s.b, s.a}) {
		t.Errorf("categorias = %v", got)
	}
	if got := s.group(t, nil); !reflect.DeepEqual(got, []string{s.inB}) {
		t.Errorf("sem categoria = %v", got)
	}
	if got := s.group(t, &s.b); !reflect.DeepEqual(got, []string{s.free, s.inA}) {
		t.Errorf("grupo b = %v", got)
	}
	if got := s.group(t, &s.a); !reflect.DeepEqual(got, []string{s.hidden}) {
		t.Errorf("grupo a = %v (o canal oculto não sai do lugar)", got)
	}
}

func TestSaveLayoutWithoutChangesReportsUnchanged(t *testing.T) {
	s := newLayoutScene(t)
	result, err := s.repo.SaveLayout(s.ctx, s.server, LayoutWrite{
		Revision:   s.revision(t),
		Categories: []string{s.a, s.b},
		Channels:   []Placement{{ChannelID: s.free}, {ChannelID: s.inA, CategoryID: &s.a}, {ChannelID: s.inB, CategoryID: &s.b}},
	}, s.viewer())
	if err != nil || result.Changed {
		t.Fatalf("resultado %+v erro %v", result, err)
	}
}

func TestSaveLayoutRefusesOtherServerAndKeepsEverything(t *testing.T) {
	s := newLayoutScene(t)
	before := s.layout(t)
	base := []Placement{{ChannelID: s.free}, {ChannelID: s.inA, CategoryID: &s.a}, {ChannelID: s.inB, CategoryID: &s.b}}
	for name, write := range map[string]LayoutWrite{
		"categoria de outro servidor na ordem": {Categories: []string{s.a, s.foreignCategory}, Channels: base},
		"canal em categoria de outro servidor": {Categories: []string{s.a, s.b}, Channels: []Placement{{ChannelID: s.free, CategoryID: &s.foreignCategory}, base[1], base[2]}},
		"canal de outro servidor":              {Categories: []string{s.a, s.b}, Channels: []Placement{{ChannelID: s.foreignCh}, base[1], base[2]}},
	} {
		t.Run(name, func(t *testing.T) {
			write.Revision = s.revision(t)
			if _, err := s.repo.SaveLayout(s.ctx, s.server, write, s.viewer()); !errors.Is(err, ErrInvalidLayout) {
				t.Fatalf("erro = %v", err)
			}
			if after := s.layout(t); !reflect.DeepEqual(before, after) {
				t.Fatalf("gravou algo: %+v", after)
			}
		})
	}
}

func TestSaveLayoutOnlyOneOfTwoConcurrentWins(t *testing.T) {
	s := newLayoutScene(t)
	revision := s.revision(t)
	writes := []LayoutWrite{
		{Revision: revision, Categories: []string{s.b, s.a}, Channels: []Placement{{ChannelID: s.free}, {ChannelID: s.inA, CategoryID: &s.a}, {ChannelID: s.inB, CategoryID: &s.b}}},
		{Revision: revision, Categories: []string{s.a, s.b}, Channels: []Placement{{ChannelID: s.inA}, {ChannelID: s.free, CategoryID: &s.a}, {ChannelID: s.inB, CategoryID: &s.b}}},
	}
	errs := make([]error, len(writes))
	var wg sync.WaitGroup
	for i, write := range writes {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = s.repo.SaveLayout(s.ctx, s.server, write, s.viewer())
		}()
	}
	wg.Wait()
	conflicts, wins := 0, 0
	for _, err := range errs {
		switch {
		case err == nil:
			wins++
		case errors.Is(err, ErrLayoutConflict):
			conflicts++
		default:
			t.Fatalf("erro inesperado: %v", err)
		}
	}
	if wins != 1 || conflicts != 1 {
		t.Fatalf("vitórias %d, conflitos %d: %v", wins, conflicts, errs)
	}
}
