package liveobs

import (
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
)

// ErrInvalidReport: o pedido não dá para gravar (400).
var ErrInvalidReport = errors.New("telemetria inválida")

// Limites: o que passa disso é cortado (texto) ou vai ao teto (número).
const (
	maxReports = 8
	maxEvents  = 10
	maxText    = 120
	maxCodec   = 16
	maxSeconds = 600.0
	maxFPS     = 240.0
	maxPixels  = 8640
	maxKbps    = 200_000
	maxCount   = 1_000_000
	maxMs      = 600_000.0
	// maxAgoMs: evento mais velho que isso fica com a hora de 15 min atrás.
	maxAgoMs = 15 * 60_000
)

var (
	kinds        = map[string]bool{KindShare: true, KindWatch: true, KindCall: true}
	transports   = map[string]bool{"udp": true, "tcp": true, "relay": true}
	limitations  = map[string]bool{"none": true, "cpu": true, "bandwidth": true, "other": true}
	targets      = map[string]bool{"desktop": true, "web": true, "android": true}
	clientEvents = map[string]bool{
		EventStepDown: true, EventStepUp: true, EventBackupOn: true, EventEncoderSW: true,
		EventDecoderSW: true, EventLongFreeze: true, EventServerPaused: true, EventCodecSwitched: true,
		EventCodecChosen: true, EventConnectFailed: true, EventReconnected: true,
		EventBackground: true, EventForeground: true, EventNetworkChanged: true, EventAudioRoute: true,
		EventSlowJoin: true, EventJoinAbandoned: true,
	}
)

// Validate confere o lote inteiro (um relatório ruim recusa o pedido).
func (b *Batch) Validate() error {
	if len(b.Reports) == 0 || len(b.Reports) > maxReports {
		return fmt.Errorf("%w: %d sessões", ErrInvalidReport, len(b.Reports))
	}
	for i := range b.Reports {
		if err := b.Reports[i].Validate(); err != nil {
			return err
		}
	}
	return nil
}

// Validate recusa ids e tipo errados e põe o resto dentro dos limites.
func (r *Report) Validate() error {
	if !isUUID(r.SessionID) || !kinds[r.Kind] || !optionalUUID(r.CallID) || !optionalUUID(r.StreamerID) {
		return fmt.Errorf("%w: sessão %q", ErrInvalidReport, r.SessionID)
	}
	r.Context.clean()
	if r.Sample != nil {
		r.Sample.clean()
	}
	r.Events = cleanEvents(r.Events)
	r.AgoMs = agoIn(r.AgoMs)
	return nil
}

func isUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil && len(s) == 36
}

func optionalUUID(s string) bool {
	return s == "" || isUUID(s)
}

func (c *ClientContext) clean() {
	c.OS = cut(c.OS, maxText)
	c.AppVersion = cut(c.AppVersion, maxCodec*2)
	c.Target = oneOf(c.Target, targets)
	c.GPU = cut(c.GPU, maxText)
	c.Network = cut(c.Network, maxCodec)
	c.Cores = max(0, min(c.Cores, 1024))
	c.Device = cut(c.Device, maxText)
}

func (s *Sample) clean() {
	s.Seconds = between(s.Seconds, 0, maxSeconds)
	s.Codec = cut(s.Codec, maxCodec)
	s.Limitation = oneOf(s.Limitation, limitations)
	s.Transport = oneOf(s.Transport, transports)
	s.FPS = floatIn(s.FPS, maxFPS)
	s.LossPct = floatIn(s.LossPct, 100)
	s.JitterMs = floatIn(s.JitterMs, maxMs)
	s.RTTMs = floatIn(s.RTTMs, maxMs)
	for _, p := range []**int{&s.Width, &s.Height, &s.TargetHeight} {
		*p = intIn(*p, maxPixels)
	}
	s.TargetFPS = intIn(s.TargetFPS, int(maxFPS))
	s.BitrateKbps = intIn(s.BitrateKbps, maxKbps)
	s.Step = intIn(s.Step, 16)
	s.Layers = intIn(s.Layers, 8)
	for _, p := range []*int{&s.StepChanges, &s.Freezes, &s.Dropped, &s.KeyFrames, &s.PLI, &s.NACK} {
		*p = countIn(*p)
	}
	s.FreezeMs = int(between(float64(s.FreezeMs), 0, maxMs))
	s.cleanQuality()
}

// cleanQuality: os sinais da ADR 0032.
func (s *Sample) cleanQuality() {
	s.CaptureFPS = floatIn(s.CaptureFPS, maxFPS)
	s.RecvFPS = floatIn(s.RecvFPS, maxFPS)
	s.CodecMs = floatIn(s.CodecMs, maxMs)
	s.ConcealedPct = floatIn(s.ConcealedPct, 100)
	s.RecvLossPct = floatIn(s.RecvLossPct, 100)
	s.ConnectMs = intIn(s.ConnectMs, int(maxMs))
}

// cleanEvents: só os tipos conhecidos, no máximo maxEvents, detalhe cortado.
func cleanEvents(events []Event) []Event {
	var out []Event
	for _, e := range events {
		if len(out) == maxEvents {
			break
		}
		if clientEvents[e.Type] {
			out = append(out, Event{Type: e.Type, Detail: cut(e.Detail, maxText), AgoMs: agoIn(e.AgoMs)})
		}
	}
	return out
}

// cut: sem espaços nas pontas e no máximo n bytes, sem partir um caractere.
func cut(s string, n int) string {
	s = strings.TrimSpace(s)
	for len(s) > n {
		_, size := utf8.DecodeLastRuneInString(s)
		s = s[:len(s)-size]
	}
	return s
}

func oneOf(s string, allowed map[string]bool) string {
	if allowed[s] {
		return s
	}
	return ""
}

func between(v, lo, hi float64) float64 {
	return max(lo, min(v, hi))
}

// floatIn: negativo vira vazio; acima do teto, o teto.
func floatIn(p *float64, hi float64) *float64 {
	if p == nil || *p < 0 {
		return nil
	}
	v := min(*p, hi)
	return &v
}

func intIn(p *int, hi int) *int {
	if p == nil || *p < 0 {
		return nil
	}
	v := min(*p, hi)
	return &v
}

func agoIn(v int) int {
	return max(0, min(v, maxAgoMs))
}

func countIn(v int) int {
	return max(0, min(v, maxCount))
}
