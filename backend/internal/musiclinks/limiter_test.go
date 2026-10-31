package musiclinks

import (
	"testing"
	"time"
)

func TestLimiterRefillsOverTime(t *testing.T) {
	now := time.Unix(0, 0)
	l := newLimiter(2, time.Minute)
	l.now = func() time.Time { return now }
	if !l.allow() || !l.allow() {
		t.Fatal("as 2 primeiras passam")
	}
	if l.allow() {
		t.Fatal("a 3ª no mesmo minuto não passa")
	}
	now = now.Add(30 * time.Second)
	if !l.allow() {
		t.Fatal("meio minuto depois volta 1 ficha")
	}
	if l.allow() {
		t.Fatal("só 1 ficha voltou")
	}
}

func TestLimiterNilAlwaysAllows(t *testing.T) {
	var l *limiter
	if !l.allow() {
		t.Fatal("sem limite")
	}
}
