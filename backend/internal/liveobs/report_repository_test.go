package liveobs

import (
	"context"
	"testing"
	"time"
)

func TestReportRepositoryAgregaSessoes(t *testing.T) {
	db := newTelemetryDB(t)
	ctx := context.Background()
	for _, q := range []string{
		`CREATE TABLE dev_badge_users (user_id UUID PRIMARY KEY)`,
		`UPDATE users SET username = 'ana' WHERE id = '` + userAna + `'`,
		`INSERT INTO dev_badge_users VALUES ('` + userAna + `')`,
	} {
		if _, err := db.Exec(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	tel := NewTelemetryRepository(db)
	hw, sw := true, false
	samples := []Sample{
		{Seconds: 20, Codec: "H265", Hardware: &hw, FPS: fp(60), TargetFPS: intp(60), Limitation: "none", Transport: "udp"},
		{Seconds: 20, Codec: "H265", Hardware: &hw, FPS: fp(30), TargetFPS: intp(60), Limitation: "cpu", Step: intp(1), StepChanges: 1, Transport: "udp"},
		{Seconds: 20, Codec: "H264", Hardware: &sw, FPS: fp(60), TargetFPS: intp(60), Limitation: "cpu", Freezes: 2, Transport: "tcp"},
	}
	for i, s := range samples {
		r := Report{SessionID: sessionA, Kind: KindShare, CallID: callA, Context: ClientContext{OS: "Windows", GPU: "RTX"},
			Sample: &s, Ended: i == len(samples)-1}
		if i == 1 {
			r.Events = []Event{{Type: EventStepDown, Detail: "0 → 1"}}
		}
		if err := tel.Save(ctx, userAna, r); err != nil {
			t.Fatal(err)
		}
	}
	repo := NewReportRepository(db)
	from := time.Now().Add(-time.Hour)
	got, err := repo.Sessions(ctx, from)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("sessões = %d, quer 1", len(got))
	}
	s := got[0]
	checks := []struct {
		name string
		ok   bool
	}{
		{"quem", s.Username == "ana" && s.UserID == userAna && s.Kind == KindShare && s.CallID == callA},
		{"contexto", s.OS == "Windows" && s.GPU == "RTX"},
		{"tempo medido", s.Seconds == 60},
		{"codec mais visto", s.Codec == "H265"},
		{"transporte mais visto", s.Transport == "udp"},
		{"na placa 2/3", s.HardwareRatio != nil && near(*s.HardwareRatio, 2.0/3)},
		{"abaixo do alvo 1/3 (fps 30 de 60 com degrau)", s.BelowRatio != nil && near(*s.BelowRatio, 1.0/3)},
		{"limitado por CPU 2/3", near(s.CPURatio, 2.0/3)},
		{"congelamentos e trocas", s.Freezes == 2 && s.StepChanges == 1},
		{"fps médio", s.FPS != nil && near(*s.FPS, 50)},
		{"terminou", !s.EndedAt.IsZero()},
	}
	for _, c := range checks {
		if !c.ok {
			t.Errorf("%s: %+v", c.name, s)
		}
	}

	events, err := repo.Events(ctx, from, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 3 || events[0].Type != EventEnd || events[0].Username != "ana" || events[1].Detail != "0 → 1" {
		t.Errorf("eventos = %+v", events)
	}

	for user, want := range map[string]bool{userAna: true, userBia: false} {
		dev, err := repo.IsDev(ctx, user)
		if err != nil || dev != want {
			t.Errorf("IsDev(%s) = %v, %v; quer %v", user, dev, err, want)
		}
	}
}

func TestReportRepositoryAgregaOsSinaisDaVoz(t *testing.T) {
	db := newTelemetryDB(t)
	ctx := context.Background()
	tel := NewTelemetryRepository(db)
	samples := []Sample{
		{Seconds: 0, ConnectMs: intp(1800)},
		{Seconds: 60, ConcealedPct: fp(2), RecvLossPct: fp(1), CaptureFPS: fp(40), RecvFPS: fp(50), CodecMs: fp(4)},
		{Seconds: 60, ConcealedPct: fp(6), RecvLossPct: fp(3), CaptureFPS: fp(50), RecvFPS: fp(30), CodecMs: fp(8)},
		{Seconds: 30, RecvLossPct: fp(5)},
	}
	access := Event{Type: EventConnectFailed, Detail: "entrando (acesso): Você não tem mais acesso a esta chamada"}
	events := [][]Event{nil, {{Type: EventReconnected, Detail: "3 s"}}, {{Type: EventReconnected}, {Type: EventConnectFailed}}, {access}}
	for i := range samples {
		r := Report{SessionID: sessionA, Kind: KindCall, CallID: callA, Sample: &samples[i], Events: events[i]}
		if err := tel.Save(ctx, userAna, r); err != nil {
			t.Fatal(err)
		}
	}
	got, err := NewReportRepository(db).Sessions(ctx, time.Now().Add(-time.Hour))
	if err != nil || len(got) != 1 {
		t.Fatalf("sessões = %v, %v", got, err)
	}
	s := got[0]
	checks := []struct {
		name string
		ok   bool
	}{
		{"áudio sintetizado médio", s.ConcealedPct != nil && near(*s.ConcealedPct, 4)},
		{"perda recebida média", s.RecvLossPct != nil && near(*s.RecvLossPct, 3)},
		{"minutos ruins: 1 robotizado, 0,5 com perda ≥ 5%", near(s.RoboticMinutes, 1) && near(s.LossMinutes, 0.5) &&
			near(s.BadMinutes, 1.5)},
		{"falha de acesso à parte", s.AccessFailures == 1},
		{"captura, recebidos e codec médios", s.CaptureFPS != nil && near(*s.CaptureFPS, 45) &&
			s.RecvFPS != nil && near(*s.RecvFPS, 40) && s.CodecMs != nil && near(*s.CodecMs, 6)},
		{"tempo para conectar", s.ConnectMs != nil && near(*s.ConnectMs, 1800)},
		{"reconexões e falhas", s.Reconnects == 2 && s.Failures == 1},
	}
	for _, c := range checks {
		if !c.ok {
			t.Errorf("%s: %+v", c.name, s)
		}
	}
}

func TestReportRepositoryLeOContextoESinaisDoCelular(t *testing.T) {
	db := newTelemetryDB(t)
	ctx := context.Background()
	tel := NewTelemetryRepository(db)
	c := ClientContext{OS: "Android 14", Target: "android", Device: "motorola moto g54", Network: "cellular-4g"}
	events := []Event{{Type: EventBackground}, {Type: EventForeground}, {Type: EventBackground},
		{Type: EventNetworkChanged, Detail: "wifi → cellular-4g"}}
	r := Report{SessionID: sessionA, Kind: KindCall, CallID: callA, Context: c, Sample: &Sample{Seconds: 60}, Events: events}
	if err := tel.Save(ctx, userAna, r); err != nil {
		t.Fatal(err)
	}
	got, err := NewReportRepository(db).Sessions(ctx, time.Now().Add(-time.Hour))
	if err != nil || len(got) != 1 {
		t.Fatalf("sessões = %v, %v", got, err)
	}
	s := got[0]
	if s.Device != "motorola moto g54" || s.Network != "cellular-4g" || s.Target != "android" {
		t.Errorf("contexto = %+v", s)
	}
	if s.Backgrounds != 2 || s.NetworkChanges != 1 {
		t.Errorf("segundo plano = %d, trocas de rede = %d; quer 2 e 1", s.Backgrounds, s.NetworkChanges)
	}
}
