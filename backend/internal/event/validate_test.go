package event

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func validInput(now time.Time) Input {
	return Input{
		Title: "Noite de jogos", StartsAt: now.Add(time.Hour),
		Recurrence: RecNone, ReminderOffsets: []int{10, 5},
	}
}

func TestNormalizeRejects(t *testing.T) {
	now := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name string
		edit func(*Input)
		want error
	}{
		{"título vazio", func(i *Input) { i.Title = "  " }, ErrInvalidTitle},
		{"título grande", func(i *Input) { i.Title = strings.Repeat("a", 101) }, ErrInvalidTitle},
		{"descrição grande", func(i *Input) { i.Description = strings.Repeat("a", 1001) }, ErrInvalidDescription},
		{"no passado", func(i *Input) { i.StartsAt = now.Add(-time.Minute) }, ErrInPast},
		{"regra desconhecida", func(i *Input) { i.Recurrence = "yearly" }, ErrInvalidRecurrence},
		{"fim sem repetição", func(i *Input) { n := 2; i.RecurrenceCount = &n }, ErrInvalidRecurrence},
		{"fim por contagem inválida", func(i *Input) { n := 0; i.RecurrenceCount = &n; i.Recurrence = RecWeekly }, ErrInvalidRecurrence},
		{"fim por data antes do início", func(i *Input) {
			d := i.StartsAt.Add(-time.Hour)
			i.RecurrenceUntil = &d
			i.Recurrence = RecWeekly
		}, ErrInvalidRecurrence},
		{"jogo com 65 caracteres", func(i *Input) { i.GameName = strings.Repeat("j", 65) }, ErrInvalidGame},
		{"jogo com caractere de controle", func(i *Input) { i.GameName = "CS\x00" }, ErrInvalidGame},
		{"banner que não é um id de arquivo", func(i *Input) { b := "../../etc/passwd"; i.BannerID = &b }, ErrInvalidBanner},
		{"duração fora da lista", func(i *Input) { i.DurationMinutes = 45 }, ErrInvalidDuration},
		{"duração negativa", func(i *Input) { i.DurationMinutes = -30 }, ErrInvalidDuration},
		{"antecedência fora da lista", func(i *Input) { i.ReminderOffsets = []int{7} }, ErrInvalidReminder},
		{"mais de 2 antecedências", func(i *Input) { i.ReminderOffsets = []int{30, 10, 5} }, ErrTooManyReminders},
	}
	for _, c := range cases {
		in := validInput(now)
		c.edit(&in)
		if _, err := in.normalize(now); !errors.Is(err, c.want) {
			t.Errorf("%s: erro %v, esperava %v", c.name, err, c.want)
		}
	}
}

func TestNormalizeAccepts(t *testing.T) {
	now := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	in := validInput(now)
	in.Title = "  Noite  "
	in.ReminderOffsets = []int{5, 10, 5}
	got, err := in.normalize(now)
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "Noite" {
		t.Errorf("título = %q", got.Title)
	}
	if len(got.ReminderOffsets) != 2 || got.ReminderOffsets[0] != 10 || got.ReminderOffsets[1] != 5 {
		t.Errorf("antecedências = %v, esperava [10 5] (maior primeiro, sem repetir)", got.ReminderOffsets)
	}
}

func TestNormalizeDefaultsOffsets(t *testing.T) {
	now := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	in := validInput(now)
	in.ReminderOffsets = nil
	got, err := in.normalize(now)
	if err != nil || len(got.ReminderOffsets) != 2 {
		t.Fatalf("nulo deve virar o padrão [10 5]: %v %v", got.ReminderOffsets, err)
	}
	in.ReminderOffsets = []int{}
	got, _ = in.normalize(now)
	if len(got.ReminderOffsets) != 0 {
		t.Errorf("lista vazia explícita = só o aviso na hora, veio %v", got.ReminderOffsets)
	}
}

func TestNormalizeDuration(t *testing.T) {
	now := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	in := validInput(now)
	got, err := in.normalize(now)
	if err != nil || got.DurationMinutes != DefaultDuration {
		t.Fatalf("sem duração deve valer %d, veio %d (%v)", DefaultDuration, got.DurationMinutes, err)
	}
	for _, minutes := range AllowedDurations {
		in.DurationMinutes = minutes
		got, err := in.normalize(now)
		if err != nil || got.DurationMinutes != minutes {
			t.Errorf("%d min: veio %d (%v)", minutes, got.DurationMinutes, err)
		}
	}
}

func TestNormalizeGame(t *testing.T) {
	now := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	cases := map[string]string{
		"":                      "",
		"   ":                   "",
		"  Minecraft  ":         "Minecraft",
		strings.Repeat("j", 64): strings.Repeat("j", 64),
		"Counter-Strike 2":      "Counter-Strike 2",
		"Jogo de Tabuleiro 🎲":   "Jogo de Tabuleiro 🎲",
	}
	for in, want := range cases {
		input := validInput(now)
		input.GameName = in
		got, err := input.normalize(now)
		if err != nil || got.GameName != want {
			t.Errorf("jogo %q → %q (%v), esperava %q", in, got.GameName, err, want)
		}
	}
}

// A edição simples (evento em andamento) também não aceita jogo inválido.
func TestCleanTextValidatesTheGameToo(t *testing.T) {
	in := Input{Title: "Noite", GameName: strings.Repeat("j", 65)}
	if _, err := in.cleanText(); !errors.Is(err, ErrInvalidGame) {
		t.Fatalf("erro = %v, esperava ErrInvalidGame", err)
	}
}
