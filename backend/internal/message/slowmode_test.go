package message

import (
	"context"
	"errors"
	"testing"
	"time"

	"gin-quickstart/backend/internal/permission"
)

// fakeSlowmodeChannels: o modo lento de cada canal, em segundos.
type fakeSlowmodeChannels map[string]int

func (f fakeSlowmodeChannels) SlowmodeSeconds(_ context.Context, channelID string) (int, error) {
	seconds, ok := f[channelID]
	if !ok {
		return 0, errors.New("canal não existe")
	}
	return seconds, nil
}

// permsByUser: as permissões de cada pessoa (em qualquer canal).
type permsByUser map[string]int64

func (p permsByUser) ChannelPerms(_ context.Context, _ string, userID string) (int64, error) {
	return p[userID], nil
}

const membro = permission.ViewChannel | permission.SendMessages

func newTestSlowmode(clock *fakeClock) *Slowmode {
	s := NewSlowmode(fakeSlowmodeChannels{"lento": 30, "livre": 0}, permsByUser{
		"ana": membro, "mod": membro | permission.ManageMessages, "gerente": membro | permission.ManageChannels,
	})
	s.now = clock.Now
	return s
}

func retryAfter(t *testing.T, err error) time.Duration {
	t.Helper()
	var slow *SlowmodeError
	if !errors.As(err, &slow) {
		t.Fatalf("err = %v, quero SlowmodeError", err)
	}
	return slow.RetryAfter
}

func TestSlowmodeSegundaMensagemEsperaOIntervalo(t *testing.T) {
	clock := &fakeClock{now: time.Unix(1000, 0)}
	s := newTestSlowmode(clock)
	ctx := context.Background()
	if _, err := s.Take(ctx, "lento", "ana"); err != nil {
		t.Fatalf("primeira: %v", err)
	}
	clock.now = clock.now.Add(12 * time.Second)
	if got := retryAfter(t, takeErr(s.Take(ctx, "lento", "ana"))); got != 18*time.Second {
		t.Fatalf("retry = %s, quero 18s", got)
	}
	clock.now = clock.now.Add(18 * time.Second)
	if _, err := s.Take(ctx, "lento", "ana"); err != nil {
		t.Fatalf("depois do intervalo: %v", err)
	}
}

func TestSlowmodeVezEPorCanalEPorPessoa(t *testing.T) {
	clock := &fakeClock{now: time.Unix(1000, 0)}
	s := NewSlowmode(fakeSlowmodeChannels{"a": 30, "b": 30}, permsByUser{"ana": membro, "bia": membro})
	s.now = clock.Now
	ctx := context.Background()
	for _, pair := range [][2]string{{"a", "ana"}, {"b", "ana"}, {"a", "bia"}} {
		if _, err := s.Take(ctx, pair[0], pair[1]); err != nil {
			t.Fatalf("%v: %v", pair, err)
		}
	}
}

func TestSlowmodeIsentosECanalLivre(t *testing.T) {
	clock := &fakeClock{now: time.Unix(1000, 0)}
	s := newTestSlowmode(clock)
	ctx := context.Background()
	cases := []struct{ channel, user string }{{"lento", "mod"}, {"lento", "gerente"}, {"livre", "ana"}, {"sumiu", "ana"}}
	for _, c := range cases {
		for i := 0; i < 3; i++ {
			if _, err := s.Take(ctx, c.channel, c.user); err != nil {
				t.Fatalf("%s em %s (%d): %v", c.user, c.channel, i, err)
			}
		}
	}
}

func TestSlowmodeReleaseDevolveAVez(t *testing.T) {
	clock := &fakeClock{now: time.Unix(1000, 0)}
	s := newTestSlowmode(clock)
	ctx := context.Background()
	at, _ := s.Take(ctx, "lento", "ana")
	s.Release("lento", "ana", at)
	if _, err := s.Take(ctx, "lento", "ana"); err != nil {
		t.Fatalf("depois do Release: %v", err)
	}
}

func TestSlowmodeNilNaoBloqueia(t *testing.T) {
	var s *Slowmode
	if _, err := s.Take(context.Background(), "lento", "ana"); err != nil {
		t.Fatal(err)
	}
	s.Release("lento", "ana", time.Time{})
}

func TestSlowmodePodaAsVezesVencidas(t *testing.T) {
	clock := &fakeClock{now: time.Unix(1000, 0)}
	s := newTestSlowmode(clock)
	s.last[slowmodeKey{"lento", "velho"}] = clock.now.Add(-slowmodeMaxWindow)
	for i := 0; i <= slowmodePruneAt; i++ {
		s.last[slowmodeKey{"lento", string(rune('a'+i%26)) + time.Duration(i).String()}] = clock.now
	}
	_, _ = s.Take(context.Background(), "lento", "ana")
	if _, ok := s.last[slowmodeKey{"lento", "velho"}]; ok {
		t.Fatal("vez vencida não foi podada")
	}
}

func TestSlowmodeErrorMensagem(t *testing.T) {
	if (&SlowmodeError{RetryAfter: 3 * time.Second}).Error() == "" {
		t.Fatal("mensagem vazia")
	}
}

// countingChannels conta as leituras do intervalo (o envio não pode ganhar
// uma consulta a mais por mensagem).
type countingChannels struct {
	fakeSlowmodeChannels
	reads int
}

func (c *countingChannels) SlowmodeSeconds(ctx context.Context, channelID string) (int, error) {
	c.reads++
	return c.fakeSlowmodeChannels.SlowmodeSeconds(ctx, channelID)
}

func TestSlowmodeLeOCanalUmaVezEAtualizaNaEdicao(t *testing.T) {
	clock := &fakeClock{now: time.Unix(1000, 0)}
	channels := &countingChannels{fakeSlowmodeChannels: fakeSlowmodeChannels{"c": 0}}
	s := NewSlowmode(channels, permsByUser{"ana": membro})
	s.now = clock.Now
	ctx := context.Background()
	for range 3 {
		if _, err := s.Take(ctx, "c", "ana"); err != nil {
			t.Fatal(err)
		}
	}
	if channels.reads != 1 {
		t.Fatalf("leu o canal %d vezes, quero 1", channels.reads)
	}
	s.SetSeconds("c", 30)
	if _, err := s.Take(ctx, "c", "ana"); err != nil {
		t.Fatalf("primeira depois de ligar: %v", err)
	}
	if got := retryAfter(t, takeErr(s.Take(ctx, "c", "ana"))); got != 30*time.Second {
		t.Fatalf("retry = %s", got)
	}
	if channels.reads != 1 {
		t.Fatalf("SetSeconds não evitou a leitura: %d", channels.reads)
	}
}

func TestSlowmodeErroAoLerNaoGuarda(t *testing.T) {
	channels := &countingChannels{fakeSlowmodeChannels: fakeSlowmodeChannels{}}
	s := NewSlowmode(channels, permsByUser{})
	_, _ = s.Take(context.Background(), "sumiu", "ana")
	_, _ = s.Take(context.Background(), "sumiu", "ana")
	if channels.reads != 2 {
		t.Fatalf("erro foi guardado: %d leituras", channels.reads)
	}
}

// racingChannels simula a edição do canal chegando durante a leitura do banco.
type racingChannels struct{ gate *Slowmode }

func (r *racingChannels) SlowmodeSeconds(context.Context, string) (int, error) {
	r.gate.SetSeconds("c", 60)
	return 0, nil
}

func TestSlowmodeEdicaoDuranteALeituraVence(t *testing.T) {
	rc := &racingChannels{}
	s := NewSlowmode(rc, permsByUser{"ana": membro})
	rc.gate = s
	ctx := context.Background()
	_, _ = s.Take(ctx, "c", "ana")
	if _, err := s.Take(ctx, "c", "ana"); err == nil {
		t.Fatal("o valor velho do banco venceu a edição")
	}
}

func takeErr(_ time.Time, err error) error { return err }

// Um envio lento que falha depois de outro já ter marcado a vez nova não pode
// apagar a vez do outro.
func TestSlowmodeReleaseNaoApagaVezDeOutroEnvio(t *testing.T) {
	clock := &fakeClock{now: time.Unix(1000, 0)}
	s := newTestSlowmode(clock)
	ctx := context.Background()
	lento, _ := s.Take(ctx, "lento", "ana")
	clock.now = clock.now.Add(31 * time.Second)
	if _, err := s.Take(ctx, "lento", "ana"); err != nil {
		t.Fatal(err)
	}
	s.Release("lento", "ana", lento)
	if _, err := s.Take(ctx, "lento", "ana"); err == nil {
		t.Fatal("o Release do envio velho apagou a vez do novo")
	}
}

func TestSlowmodeRunMarcaAVezEDevolveSeOEnvioFalhar(t *testing.T) {
	s := newTestSlowmode(&fakeClock{now: time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)})
	ctx := context.Background()
	if _, err := s.Run(ctx, "lento", "ana", func() (*Message, error) { return nil, errors.New("falhou") }); err == nil {
		t.Fatal("Run deveria devolver o erro do envio")
	}
	msg, err := s.Run(ctx, "lento", "ana", func() (*Message, error) { return &Message{ID: "m1"}, nil })
	if err != nil || msg.ID != "m1" {
		t.Fatalf("envio que falhou gastou a vez: msg = %v, err = %v", msg, err)
	}
	called := false
	_, err = s.Run(ctx, "lento", "ana", func() (*Message, error) { called = true; return nil, nil })
	if retryAfter(t, err) <= 0 || called {
		t.Fatalf("sem vez: err = %v, send chamado = %v", err, called)
	}
}
