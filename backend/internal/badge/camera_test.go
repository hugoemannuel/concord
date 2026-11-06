package badge

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"gin-quickstart/backend/internal/call"

	"github.com/google/uuid"
)

func TestCameraTiers(t *testing.T) {
	c := category(t, "camera")
	if c.Name != "Câmera ligada" || c.Unit != UnitSeconds || c.Exclusive {
		t.Fatalf("category = %+v", c)
	}
	assertTiers(t, "camera", []Tier{
		{"Rostinho", 1 * hour, RarityCommon},
		{"Ao Vivo", 10 * hour, RarityCommon},
		{"Galã", 50 * hour, RarityRare},
		{"Influencer", 150 * hour, RarityEpic},
		{"Big Brother", 500 * hour, RarityLegendary},
	})
}

func TestEvaluateCameraUsesCameraSeconds(t *testing.T) {
	badges, _ := Evaluate(Stats{CreatedAt: FounderCutoff, CameraSeconds: 12 * hour}, nil, now)
	if b := find(t, badges, "camera"); b.Value != 12*hour || b.Tier != 2 || b.TierName != "Ao Vivo" {
		t.Fatalf("camera = %+v", b)
	}
}

// Câmera conta como o Streamer: precisa estar na call com mais alguém ouvindo.
func TestTrackerCountsCameraOnlyWithAudience(t *testing.T) {
	tr := newTracker(t0, time.UTC)
	tr.setCameras(map[string]bool{"ana": true, "caio": true, "duda": true})
	runTicks(tr, t0, 3,
		snap("c1", []string{"ana", "bia"}, nil, nil),
		snap("c2", []string{"caio"}, nil, nil),                                                              // sozinho
		call.CallSnapshot{CallID: "c3", Participants: []string{"duda", "edu"}, Listeners: []string{"duda"}}, // edu surdo
	)
	deltas := tr.drain()
	if got := deltas["ana"].Camera; got != 30 {
		t.Fatalf("ana camera = %d s, want 30", got)
	}
	if deltas["caio"].Camera != 0 || deltas["duda"].Camera != 0 || deltas["bia"].Camera != 0 {
		t.Fatalf("camera without audience or off: %+v", deltas)
	}
}

func TestTrackerRestoreGivesBackCamera(t *testing.T) {
	tr := newTracker(t0, time.UTC)
	tr.restore("ana", Delta{Camera: 42})
	if got := tr.drain()["ana"].Camera; got != 42 {
		t.Fatalf("camera = %d, want 42", got)
	}
}

type fakeCameras struct {
	mu    sync.Mutex
	on    map[string][]string
	asked []string
	err   error
}

func (f *fakeCameras) CamerasOn(_ context.Context, callID string) ([]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.asked = append(f.asked, callID)
	return f.on[callID], f.err
}

// O tick pergunta ao LiveKit só pelas calls em que a câmera pode contar
// (duas pessoas ouvindo) e grava o tempo no flush.
func TestTickCountsCameraFromLiveKit(t *testing.T) {
	s, st, _, calls, _ := newTestService()
	cams := &fakeCameras{on: map[string][]string{"c1": {"ana"}}}
	s.WithCameras(cams)
	st.stats["ana"] = Stats{CreatedAt: FounderCutoff}
	st.stats["bia"] = Stats{CreatedAt: FounderCutoff}
	calls.snaps = []call.CallSnapshot{
		snap("c1", []string{"ana", "bia"}, nil, nil),
		snap("c2", []string{"caio"}, nil, nil),
	}
	at := t0
	for i := 0; i < flushEvery; i++ {
		at = at.Add(tickInterval)
		s.tick(context.Background(), at)
	}
	if got := st.deltas["ana"].Camera; got != 60 {
		t.Fatalf("ana camera = %d, want 60", got)
	}
	for _, id := range cams.asked {
		if id != "c1" {
			t.Fatalf("asked LiveKit about %s (ninguém para ver)", id)
		}
	}
}

// LiveKit fora do ar: a câmera não conta, o resto continua.
func TestTickWithoutLiveKitStillWorks(t *testing.T) {
	s, st, _, calls, _ := newTestService()
	s.WithCameras(&fakeCameras{err: errors.New("livekit down")})
	st.stats["ana"] = Stats{CreatedAt: FounderCutoff}
	calls.snaps = []call.CallSnapshot{snap("c1", []string{"ana", "bia"}, nil, []string{"ana"})}
	at := t0
	for i := 0; i < flushEvery; i++ {
		at = at.Add(tickInterval)
		s.tick(context.Background(), at)
	}
	if d := st.deltas["ana"]; d.Camera != 0 || d.Stream != 60 {
		t.Fatalf("ana delta = %+v", d)
	}
}

func TestCameraDB(t *testing.T) {
	d := newTestDB(t)
	ana, _ := d.user()
	repo := BadgeRepository(d.db)
	if err := repo.AddCallStats(d.ctx, map[string]Delta{ana: {Camera: 30}}); err != nil {
		t.Fatal(err)
	}
	if err := repo.AddCallStats(d.ctx, map[string]Delta{ana: {Camera: 15, Stream: 5}}); err != nil {
		t.Fatal(err)
	}
	if s, err := repo.Stats(d.ctx, ana); err != nil || s.CameraSeconds != 45 || s.StreamSeconds != 5 {
		t.Fatalf("camera = %d stream = %d, %v", s.CameraSeconds, s.StreamSeconds, err)
	}
}

// Várias pessoas numa escrita; quem não existe mais (conta apagada no meio da
// call) é pulado sem derrubar as outras.
func TestAddCallStatsEmLote(t *testing.T) {
	d := newTestDB(t)
	ana, _ := d.user()
	bia, _ := d.user()
	repo := BadgeRepository(d.db)
	gone := uuid.NewString()
	if err := repo.AddCallStats(d.ctx, map[string]Delta{
		ana: {Stream: 30, PeakCallSize: 3}, bia: {Watch: 20, LongestSession: 90}, gone: {Stream: 1},
	}); err != nil {
		t.Fatal(err)
	}
	if err := repo.AddCallStats(d.ctx, map[string]Delta{ana: {Stream: 10, PeakCallSize: 2}}); err != nil {
		t.Fatal(err)
	}
	if err := repo.AddCallStats(d.ctx, nil); err != nil {
		t.Fatal(err)
	}
	a, err := repo.Stats(d.ctx, ana)
	if err != nil || a.StreamSeconds != 40 || a.PeakCallSize != 3 {
		t.Fatalf("ana = stream %d pico %d, %v", a.StreamSeconds, a.PeakCallSize, err)
	}
	b, err := repo.Stats(d.ctx, bia)
	if err != nil || b.WatchSeconds != 20 || b.LongestSessionSeconds != 90 {
		t.Fatalf("bia = watch %d sessão %d, %v", b.WatchSeconds, b.LongestSessionSeconds, err)
	}
}
