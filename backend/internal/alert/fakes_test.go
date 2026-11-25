package alert

import (
	"context"
	"errors"
	"time"
)

// fakeStore: os incidentes na memória.
type fakeStore struct {
	rows   []Incident
	nextID int64
	fail   error
}

func (f *fakeStore) OpenIncidents(context.Context) ([]Incident, error) {
	var out []Incident
	for _, r := range f.rows {
		if r.EndedAt == nil {
			out = append(out, r)
		}
	}
	return out, f.fail
}

func (f *fakeStore) InsertIncident(_ context.Context, inc *Incident) error {
	if f.fail != nil {
		return f.fail
	}
	f.nextID++
	inc.ID = f.nextID
	f.rows = append(f.rows, *inc)
	return nil
}

func (f *fakeStore) UpdateIncident(_ context.Context, inc Incident) error {
	for i := range f.rows {
		if f.rows[i].ID == inc.ID {
			f.rows[i] = inc
			return nil
		}
	}
	return errors.New("não achei")
}

func (f *fakeStore) CloseIncident(_ context.Context, id int64, at time.Time) error {
	for i := range f.rows {
		if f.rows[i].ID == id {
			f.rows[i].EndedAt = &at
			return nil
		}
	}
	return errors.New("não achei")
}

type sent struct {
	channel ChannelKind
	level   Level
	text    string
}

type fakeSender struct{ msgs []sent }

func (f *fakeSender) Send(_ context.Context, ch ChannelKind, level Level, text string) error {
	f.msgs = append(f.msgs, sent{ch, level, text})
	return nil
}

// scripted: uma regra cujas leituras vêm de uma variável.
type scripted struct {
	reading Reading
	err     error
}

func (s *scripted) rule(id string, hold Hold) Rule {
	return Rule{ID: id, Title: "Coisa", Channel: ChannelInfra, Hold: hold,
		Check: func(context.Context, time.Time) (Reading, error) { return s.reading, s.err }}
}
