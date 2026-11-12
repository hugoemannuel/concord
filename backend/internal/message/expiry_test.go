package message

import (
	"context"
	"errors"
	"reflect"
	"sync"
	"testing"
	"time"
)

type fakeExpiryRepo struct {
	mu           sync.Mutex
	onBatch      func()
	batches      [][]ExpiredMessage
	calls        int
	limits       []int
	viewOnce     []ExpiredViewOnce
	pending      []string
	marked       []string
	messages     map[string]*Message
	sentBefore   time.Time
	viewedBefore time.Time
	err          error
}

func (r *fakeExpiryRepo) DeleteExpired(_ context.Context, _ time.Time, limit int) ([]ExpiredMessage, error) {
	r.mu.Lock()
	r.limits = append(r.limits, limit)
	r.mu.Unlock()
	if r.onBatch != nil {
		defer r.onBatch()
	}
	if r.err != nil {
		return nil, r.err
	}
	i := r.calls
	r.calls++
	if i >= len(r.batches) {
		return nil, nil
	}
	return r.batches[i], nil
}

func (r *fakeExpiryRepo) chamadas() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.limits)
}

func (r *fakeExpiryRepo) ExpireViewOnce(_ context.Context, sentBefore, viewedBefore time.Time) ([]ExpiredViewOnce, error) {
	r.sentBefore, r.viewedBefore = sentBefore, viewedBefore
	return r.viewOnce, nil
}

func (r *fakeExpiryRepo) PendingViewOnceFiles(_ context.Context, _ int) ([]string, error) {
	return r.pending, nil
}

func (r *fakeExpiryRepo) MarkViewOnceFilesRemoved(_ context.Context, ids []string) error {
	r.marked = append(r.marked, ids...)
	return nil
}

func (r *fakeExpiryRepo) FindByID(_ context.Context, id string) (*Message, error) {
	if m, ok := r.messages[id]; ok {
		c := *m
		return &c, nil
	}
	return nil, errors.New("nao achou")
}

func (r *fakeExpiryRepo) AttachAttachments(_ context.Context, _ []Message) error { return nil }

type fakeExpiryRooms struct {
	users map[string][]string
	err   error
	calls map[string]int
}

func (f *fakeExpiryRooms) ConversationParticipantIDs(_ context.Context, id string) ([]string, error) {
	if f.calls == nil {
		f.calls = map[string]int{}
	}
	f.calls[id]++
	return f.users[id], f.err
}

type fakeExpiryFiles struct {
	removed []string
	failOn  string
}

func (f *fakeExpiryFiles) Remove(name string) error {
	f.removed = append(f.removed, name)
	if name == f.failOn {
		return errors.New("disco")
	}
	return nil
}

type deletePublisher struct {
	pinTestPublisher
	deleted []DeleteEvent
	updated []UpdateEvent
}

func (p *deletePublisher) PublishMessageUpdate(e UpdateEvent) { p.updated = append(p.updated, e) }

func (p *deletePublisher) PublishMessageDelete(e DeleteEvent) { p.deleted = append(p.deleted, e) }

func TestSweeperApagaEPublica(t *testing.T) {
	repo := &fakeExpiryRepo{batches: [][]ExpiredMessage{{
		{ID: "m1", ConversationID: "c1", AttachmentIDs: []string{"a1"}},
		{ID: "m2", ConversationID: "c2", AttachmentIDs: []string{"a2", "a3"}},
	}}}
	rooms := &fakeExpiryRooms{users: map[string][]string{"c1": {"ana", "bia"}, "c2": {"caio"}}}
	files, pub := &fakeExpiryFiles{failOn: "a2"}, &deletePublisher{}

	if err := NewExpirySweeper(repo, rooms, files, pub).RunOnce(context.Background(), time.Now()); err != nil {
		t.Fatal(err)
	}
	if want := []string{"a1", "a2", "a3"}; !reflect.DeepEqual(files.removed, want) {
		t.Fatalf("arquivos removidos = %v, want %v (falha em um não pode parar)", files.removed, want)
	}
	c1, c2 := "c1", "c2"
	want := []DeleteEvent{
		{ConversationID: &c1, UserIDs: []string{"ana", "bia"}, MessageID: "m1", Expired: true},
		{ConversationID: &c2, UserIDs: []string{"caio"}, MessageID: "m2", Expired: true},
	}
	if !reflect.DeepEqual(pub.deleted, want) {
		t.Fatalf("eventos = %+v, want %+v", pub.deleted, want)
	}
}

func TestSweeperRepeteEnquantoLoteCheio(t *testing.T) {
	full := make([]ExpiredMessage, 500)
	for i := range full {
		full[i] = ExpiredMessage{ID: "m", ConversationID: "c1"}
	}
	repo := &fakeExpiryRepo{batches: [][]ExpiredMessage{full, full[:3]}}
	rooms := &fakeExpiryRooms{users: map[string][]string{"c1": {"ana"}}}
	pub := &deletePublisher{}

	if err := NewExpirySweeper(repo, rooms, &fakeExpiryFiles{}, pub).RunOnce(context.Background(), time.Now()); err != nil {
		t.Fatal(err)
	}
	if repo.calls != 2 || !reflect.DeepEqual(repo.limits, []int{500, 500}) {
		t.Fatalf("chamadas = %d, limites = %v, want 2 de 500", repo.calls, repo.limits)
	}
	if len(pub.deleted) != 503 {
		t.Fatalf("eventos = %d, want 503", len(pub.deleted))
	}
	if rooms.calls["c1"] != 1 {
		t.Fatalf("participantes consultados %d vezes, want 1 (cache por passada)", rooms.calls["c1"])
	}
}

func TestSweeperExpiraVisualizacaoUnicaApos14Dias(t *testing.T) {
	now := time.Date(2026, 11, 12, 12, 0, 0, 0, time.UTC)
	repo := &fakeExpiryRepo{
		viewOnce: []ExpiredViewOnce{{AttachmentID: "v1", MessageID: "m1", ConversationID: "c1"}, {AttachmentID: "v2", MessageID: "m1", ConversationID: "c1"}},
		pending:  []string{"v1", "v2"},
		messages: map[string]*Message{"m1": {ID: "m1"}},
	}
	files := &fakeExpiryFiles{}

	pub := &deletePublisher{}
	rooms := &fakeExpiryRooms{users: map[string][]string{"c1": {"ana", "bia"}}}
	if err := NewExpirySweeper(repo, rooms, files, pub).RunOnce(context.Background(), now); err != nil {
		t.Fatal(err)
	}
	// Um message:update por mensagem (dois anexos da mesma), para os participantes.
	if len(pub.updated) != 1 || pub.updated[0].Message.ID != "m1" || !reflect.DeepEqual(pub.updated[0].UserIDs, []string{"ana", "bia"}) {
		t.Fatalf("updates = %+v", pub.updated)
	}
	if want := []string{"v1", "v2"}; !reflect.DeepEqual(repo.marked, want) {
		t.Fatalf("marcados = %v, want %v", repo.marked, want)
	}
	if want := now.Add(-14 * 24 * time.Hour); !repo.sentBefore.Equal(want) {
		t.Fatalf("sentBefore = %v, want %v", repo.sentBefore, want)
	}
	// Quem abriu tem o token por 5 min: o arquivo só sai depois disso.
	if want := now.Add(-5 * time.Minute); !repo.viewedBefore.Equal(want) {
		t.Fatalf("viewedBefore = %v, want %v", repo.viewedBefore, want)
	}
	if want := []string{"v1", "v2"}; !reflect.DeepEqual(files.removed, want) {
		t.Fatalf("arquivos removidos = %v, want %v", files.removed, want)
	}
}

func TestSweeperErroNoRepoNaoPublica(t *testing.T) {
	repo := &fakeExpiryRepo{err: errors.New("banco")}
	files, pub := &fakeExpiryFiles{}, &deletePublisher{}

	if err := NewExpirySweeper(repo, &fakeExpiryRooms{}, files, pub).RunOnce(context.Background(), time.Now()); err == nil {
		t.Fatal("RunOnce deveria devolver o erro do repositório")
	}
	if len(pub.deleted) != 0 || len(files.removed) != 0 {
		t.Fatalf("publicou %d eventos e removeu %d arquivos", len(pub.deleted), len(files.removed))
	}
}

// A linha já sumiu: sem os participantes, o aviso ainda vai para a sala.
func TestSweeperPublicaMesmoSemParticipantes(t *testing.T) {
	repo := &fakeExpiryRepo{batches: [][]ExpiredMessage{{{ID: "m1", ConversationID: "c1"}}}}
	rooms := &fakeExpiryRooms{err: errors.New("banco")}
	pub := &deletePublisher{}

	if err := NewExpirySweeper(repo, rooms, &fakeExpiryFiles{}, pub).RunOnce(context.Background(), time.Now()); err != nil {
		t.Fatal(err)
	}
	if len(pub.deleted) != 1 || len(pub.deleted[0].UserIDs) != 0 || pub.deleted[0].MessageID != "m1" {
		t.Fatalf("eventos = %+v", pub.deleted)
	}
}

// Run varre assim que começa (mesmo com erro) e para quando o ctx acaba.
func TestSweeperRunVarreEPara(t *testing.T) {
	repo := &fakeExpiryRepo{err: errors.New("banco")}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		NewExpirySweeper(repo, &fakeExpiryRooms{}, &fakeExpiryFiles{}, &deletePublisher{}).Run(ctx, time.Hour)
		close(done)
	}()
	for i := 0; i < 200 && repo.chamadas() == 0; i++ {
		time.Sleep(10 * time.Millisecond)
	}
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run não parou com o ctx cancelado")
	}
	if repo.chamadas() == 0 {
		t.Fatal("Run não varreu ao começar")
	}
}

// Cancelado depois do primeiro lote cheio: não pede o próximo e devolve o erro do ctx.
func TestSweeperParaEntreLotesSeCtxCancelado(t *testing.T) {
	full := make([]ExpiredMessage, 500)
	for i := range full {
		full[i] = ExpiredMessage{ID: "m", ConversationID: "c1"}
	}
	ctx, cancel := context.WithCancel(context.Background())
	repo := &fakeExpiryRepo{batches: [][]ExpiredMessage{full, full[:3]}, onBatch: cancel}

	err := NewExpirySweeper(repo, &fakeExpiryRooms{}, &fakeExpiryFiles{}, &deletePublisher{}).RunOnce(ctx, time.Now())
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
	if repo.calls != 1 {
		t.Fatalf("chamadas = %d, want 1", repo.calls)
	}
}

// Depois de uma queda entre marcar e apagar, o arquivo continua pendente: a
// próxima passada remove de novo e só marca o que saiu (falha fica para depois).
func TestSweeperRetomaArquivosPendentes(t *testing.T) {
	repo := &fakeExpiryRepo{pending: []string{"p1", "p2", "p3"}}
	files := &fakeExpiryFiles{failOn: "p2"}

	if err := NewExpirySweeper(repo, &fakeExpiryRooms{}, files, &deletePublisher{}).RunOnce(context.Background(), time.Now()); err != nil {
		t.Fatal(err)
	}
	if want := []string{"p1", "p2", "p3"}; !reflect.DeepEqual(files.removed, want) {
		t.Fatalf("removidos = %v, want %v", files.removed, want)
	}
	if want := []string{"p1", "p3"}; !reflect.DeepEqual(repo.marked, want) {
		t.Fatalf("marcados = %v, want %v", repo.marked, want)
	}
}
