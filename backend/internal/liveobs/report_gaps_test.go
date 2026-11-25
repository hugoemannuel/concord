package liveobs

import (
	"testing"
	"time"
)

func minutesAt(offsets ...int) []ServerMinute {
	out := []ServerMinute{}
	for _, o := range offsets {
		out = append(out, ServerMinute{Minute: t0.Add(time.Duration(o) * time.Minute), Up: true})
	}
	return out
}

func TestCollectionGapsAcharOsMinutosSemColeta(t *testing.T) {
	// 0,1,2 · buraco de 3 (3,4,5) · 6 · 1 minuto só faltando (7) · 8 · ... fim em 20.
	minutes := minutesAt(0, 1, 2, 6, 8)
	got := collectionGaps(minutes, t0.Add(20*time.Minute+30*time.Second))
	if len(got) != 2 {
		t.Fatalf("buracos = %+v, quer 2 (o de 1 minuto é ruído do relógio)", got)
	}
	// Do mais recente: do minuto 9 até agora (o coletor parou), depois o de 3 a 6.
	last, first := got[0], got[1]
	if !last.From.Equal(t0.Add(9*time.Minute)) || !last.To.Equal(t0.Add(20*time.Minute)) || last.Minutes != 11 {
		t.Errorf("buraco até agora = %+v", last)
	}
	if !first.From.Equal(t0.Add(3*time.Minute)) || !first.To.Equal(t0.Add(6*time.Minute)) || first.Minutes != 3 {
		t.Errorf("buraco do meio = %+v", first)
	}
}

func TestCollectionGapsSemBuraco(t *testing.T) {
	if got := collectionGaps(minutesAt(0, 1, 2), t0.Add(3*time.Minute+50*time.Second)); len(got) != 0 {
		t.Errorf("sem buraco: %+v", got)
	}
	// Sem nenhum minuto (coletor desligado): nada a comparar, nada a mostrar.
	if got := collectionGaps(nil, t0); got == nil || len(got) != 0 {
		t.Errorf("sem minutos: %#v, quer []", got)
	}
}

func TestLiveKitRestartsQuandoOInicioMuda(t *testing.T) {
	a, b := t0.Add(-48*time.Hour), t0.Add(10*time.Minute)
	minutes := minutesAt(0, 1, 2, 3, 11, 12)
	minutes[0].LiveKitStartedAt = &a
	minutes[1].LiveKitStartedAt = &a
	// minuto 2: o LiveKit não respondeu (sem valor), e não é reinício.
	minutes[3].LiveKitStartedAt = &a
	minutes[4].LiveKitStartedAt = &b
	minutes[5].LiveKitStartedAt = &b
	got := liveKitRestarts(minutes)
	if len(got) != 1 || !got[0].At.Equal(b) || !got[0].SeenAt.Equal(t0.Add(11*time.Minute)) {
		t.Errorf("reinícios = %+v, quer 1 (às %v)", got, b)
	}
	if got := liveKitRestarts(minutesAt(0, 1)); got == nil || len(got) != 0 {
		t.Errorf("dados de antes (sem a coluna): %#v, quer []", got)
	}
}

func TestBuildReportLevaBuracosEReinicios(t *testing.T) {
	r := buildReport(t0.Add(-time.Hour), t0.Add(10*time.Minute), nil, minutesAt(0), nil)
	if len(r.CollectionGaps) != 1 || r.LiveKitRestarts == nil {
		t.Errorf("buracos = %+v, reinícios = %#v", r.CollectionGaps, r.LiveKitRestarts)
	}
}
