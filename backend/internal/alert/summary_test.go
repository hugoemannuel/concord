package alert

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/apperrors"
)

type fakeSummaryStore struct {
	claimed  map[string]bool
	claims   int
	released int
	stats    DayStats
	from, to time.Time
	err      error
}

func (f *fakeSummaryStore) DayStats(_ context.Context, from, to time.Time) (DayStats, error) {
	f.from, f.to = from, to
	return f.stats, f.err
}

func (f *fakeSummaryStore) ClaimDailySummary(_ context.Context, day, _ time.Time) (bool, error) {
	f.claims++
	key := day.Format(time.DateOnly)
	if f.claimed[key] {
		return false, nil
	}
	f.claimed[key] = true
	return true, nil
}

func (f *fakeSummaryStore) ReleaseDailySummary(_ context.Context, day time.Time) error {
	f.released++
	delete(f.claimed, day.Format(time.DateOnly))
	return nil
}

func newSummary(store *fakeSummaryStore, now *time.Time, posted *[]string, postErr *error) *DailySummary {
	d := NewDailySummary(store, &fakeSources{}, func(_ context.Context, ruleID string, ch ChannelKind, text string) error {
		if ruleID != "daily_summary" || ch != ChannelDaily {
			panic("canal ou regra errados")
		}
		if *postErr != nil {
			return *postErr
		}
		*posted = append(*posted, text)
		return nil
	}, nil, "")
	d.now = func() time.Time { return *now }
	return d
}

func TestDailySummaryUmaVezPorDiaDepoisDas8(t *testing.T) {
	store := &fakeSummaryStore{claimed: map[string]bool{}}
	now := at(7, 59)
	var posted []string
	var postErr error
	d := newSummary(store, &now, &posted, &postErr)
	ctx := context.Background()
	_ = d.Tick(ctx)
	if len(posted) != 0 || store.claims != 0 {
		t.Fatal("mandou antes das 8h")
	}
	now = at(8, 0)
	_ = d.Tick(ctx)
	now = at(8, 1)
	_ = d.Tick(ctx)
	if len(posted) != 1 || store.claims != 1 {
		t.Fatalf("posts = %d, marcas = %d", len(posted), store.claims)
	}
	if !store.from.Equal(time.Date(2026, 11, 24, 0, 0, 0, 0, brt)) || store.to.Sub(store.from) != 24*time.Hour {
		t.Errorf("dia = %v a %v", store.from, store.to)
	}
	// Outro processo (reinício) no mesmo dia: a marca do banco segura.
	d2 := newSummary(store, &now, &posted, &postErr)
	_ = d2.Tick(ctx)
	if len(posted) != 1 {
		t.Fatal("repetiu depois de reiniciar")
	}
	now = at(8, 0).AddDate(0, 0, 1)
	_ = d.Tick(ctx)
	if len(posted) != 2 {
		t.Fatal("não mandou no dia seguinte")
	}
}

func TestDailySummaryPostQueFalhaTentaDeNovo(t *testing.T) {
	store := &fakeSummaryStore{claimed: map[string]bool{}}
	now := at(9, 0)
	var posted []string
	postErr := errors.New("canal")
	d := newSummary(store, &now, &posted, &postErr)
	if err := d.Tick(context.Background()); err == nil || store.released != 1 {
		t.Fatalf("err = %v, desmarcou %d", err, store.released)
	}
	postErr = nil
	now = at(9, 1)
	if err := d.Tick(context.Background()); err != nil || len(posted) != 1 {
		t.Fatalf("err = %v, posts = %d", err, len(posted))
	}
	store.err = errors.New("banco")
	store.claimed = map[string]bool{}
	d.done = time.Time{}
	if err := d.Tick(context.Background()); err == nil || store.released != 2 {
		t.Fatalf("erro nas contas: err = %v, desmarcou %d", err, store.released)
	}
}

func TestSummaryText(t *testing.T) {
	day := time.Date(2026, 11, 24, 0, 0, 0, 0, brt)
	backup := time.Date(2026, 11, 24, 21, 13, 0, 0, brt)
	bytes := int64(120 << 20)
	s := DayStats{
		CallPeople: 18, CallHours: 42.25, Lives: 12, LivesBelow: 4, PeakMbps: num(38.4),
		ConnectFailed: 3, FailedPeople: 2, Reconnects: 5, ReconnectPeople: 4,
		Requests: 12345, Errors5xx: 14, Panics: 1, P95Typical: num(120), P95Worst: num(2500),
		CPUMax: num(74), CPUP95: num(40), MemMax: num(88), DiskPct: num(41),
		BackupAt: &backup, BackupBytes: &bytes,
		Alerts:     []RuleCount{{"host_cpu", 2}, {"error_new", 1}},
		OpenAlerts: 1,
	}
	top := []apperrors.GroupImpact{{Source: apperrors.SourceRenderer, Kind: "TypeError", Message: "x is undefined", Users: 6}}
	got := summaryText(day, s, top, map[string]string{"host_cpu": "CPU da máquina"}, " https://app/observabilidade/alertas")
	want := strings.Join([]string{
		"Resumo de 24/11 (horário de Brasília)",
		"Voz: 18 pessoas, 42,2 h em call; 3 falhas de conexão (2 pessoas), 5 reconexões (4 pessoas)",
		"Lives: 12, 4 abaixo do alvo; pico de saída 38 Mbps (teto perto de 60 Mbps)",
		`Erros com mais gente: "TypeError: x is undefined" (app) 6 pessoas`,
		"API: 12345 pedidos, 14 com 5xx (0,1%); p95 típico 120 ms, pior minuto 2500 ms; 1 panics",
		"Máquina: CPU no pico 74% (p95 40%), memória no pico 88%, disco 41%; backup de 21:13, 120 MB",
		"Alertas: 3 (CPU da máquina 2, error_new 1); abertos agora: 1",
		"Painel: https://app/observabilidade/alertas",
	}, "\n")
	if got != want {
		t.Errorf("texto =\n%s\nquer\n%s", got, want)
	}
}

func TestSummaryTextSemDados(t *testing.T) {
	day := time.Date(2026, 11, 24, 0, 0, 0, 0, brt)
	old := day.Add(-26 * time.Hour)
	got := summaryText(day, DayStats{BackupAt: &old}, nil, nil, "")
	for _, part := range []string{
		"Voz: 0 pessoas, 0,0 h em call",
		"pico de saída sem dado",
		"Erros: nenhum com pessoas afetadas",
		"API: 0 pedidos, 0 com 5xx (0%); p95 típico sem dado",
		"CPU no pico sem dado",
		"backup NÃO rodou (o mais novo é de 22/11 22:00)",
		"Alertas: nenhum; abertos agora: 0",
	} {
		if !strings.Contains(got, part) {
			t.Errorf("faltou %q em\n%s", part, got)
		}
	}
	if strings.Contains(got, "Painel") {
		t.Error("link sem APP_URL")
	}
	if got := backupLine(DayStats{}, day); got != "backup: sem dado" {
		t.Errorf("sem backup = %q", got)
	}
}
