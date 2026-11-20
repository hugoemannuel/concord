package message

import (
	"context"
	"errors"
	"gin-quickstart/backend/internal/permission"
	"testing"
	"time"
)

func TestDetectEveryoneMention(t *testing.T) {
	cases := []struct {
		content string
		want    string
	}{
		{"@all bora jogar", MentionAll},
		{"bora jogar @all", MentionAll},
		{"ei @ALL, chegou", MentionAll},
		{"@All.", MentionAll},
		{"(@all)", MentionAll},
		{"@here alguém on?", MentionHere},
		{"quem tá aí @Here?", MentionHere},
		{"linha 1\n@here", MentionHere},
		// @all vale mais que @here: avisa todo mundo.
		{"@here e @all", MentionAll},
		// @everyone é o @all de quem vem do Discord.
		{"@everyone bora", MentionAll},
		{"ei @Everyone.", MentionAll},
		{"@here e @everyone", MentionAll},
		{"@everyones", ""},
		{"x.com/@everyone", ""},
		{"`@everyone`", ""},
		{"sem menção nenhuma", ""},
		{"all here", ""},
		{"@allan oi", ""},
		{"@all_bot oi", ""},
		{"@heres", ""},
		{"@all.bot", ""},
		{"fulano@all.com", ""},
		{"x@here", ""},
		{"@@all", ""},
		{"meu_@all", ""},
		{"@", ""},
		{"", ""},
		// Só no começo, depois de espaço ou de pontuação de abertura.
		{"[@all]", MentionAll},
		{"\"@here\" pessoal", MentionHere},
		{"'@all'", MentionAll},
		{"{@all}", MentionAll},
		{"<@all>", MentionAll},
		{"*@all*", MentionAll},
		{"~@here~", MentionHere},
		{"oi\t@all", MentionAll},
		{"“@all”", MentionAll},
		// Links de perfil não pingam ninguém.
		{"x.com/@all", ""},
		{"olha https://medium.com/@here", ""},
		{"https://www.youtube.com/@all/videos", ""},
		{"#@all", ""},
		{"-@all", ""},
		{"é@all", ""},
		{":@here", ""},
		{"x.com/@all mas @here vale", MentionHere},
		// Depois do token: fim, espaço ou pontuação de fechamento.
		{"@all, bora", MentionAll},
		{"@all!", MentionAll},
		{"@all?", MentionAll},
		{"@all: reunião", MentionAll},
		{"@all; ok", MentionAll},
		{"@all...", MentionAll},
		{"(@here)", MentionHere},
		{"[@all]", MentionAll},
		{"{@all}", MentionAll},
		{"\"@all\"", MentionAll},
		{"'@all'", MentionAll},
		{"“@all”", MentionAll},
		{"‘@all’", MentionAll},
		{"«@all»", MentionAll},
		{"*@all*", MentionAll},
		{"@all\nbora", MentionAll},
		// Letra, número, -, _, @, / ou apóstrofo + letra continuam a palavra.
		{"@all-hands amanhã", ""},
		{"@all's fine", ""},
		{"@all’s fine", ""},
		{"@here's", ""},
		{"@all1", ""},
		{"@all-", ""},
		{"@all@x", ""},
		{"@all/x", ""},
		{"@allé", ""},
		{"@all.-", ""},
		{"@all-hands e @here!", MentionHere},
	}
	for _, tc := range cases {
		if got := DetectEveryoneMention(tc.content); got != tc.want {
			t.Errorf("DetectEveryoneMention(%q) = %q, want %q", tc.content, got, tc.want)
		}
	}
}

type fakeClock struct{ now time.Time }

func (c *fakeClock) Now() time.Time { return c.now }

func TestMentionLimiterAllowsOnePerAuthorPerChannelEvery30s(t *testing.T) {
	clock := &fakeClock{now: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)}
	limiter := newMentionLimiter(30*time.Second, clock.Now)

	if !limiter.Allow("ana", "ch1") {
		t.Fatal("first @all should be allowed")
	}
	clock.now = clock.now.Add(10 * time.Second)
	if limiter.Allow("ana", "ch1") {
		t.Fatal("second @all within 30s should be blocked")
	}
	// Outro canal e outro autor têm a própria janela.
	if !limiter.Allow("ana", "ch2") {
		t.Fatal("other channel should be allowed")
	}
	if !limiter.Allow("bia", "ch1") {
		t.Fatal("other author should be allowed")
	}
	// Bloqueada não reinicia a janela: conta a partir da última que pingou.
	clock.now = clock.now.Add(20 * time.Second)
	if !limiter.Allow("ana", "ch1") {
		t.Fatal("@all after 30s should be allowed again")
	}
	if limiter.Allow("ana", "ch1") {
		t.Fatal("right after a ping, blocked again")
	}
}

// fakeModerators devolve MENTION_EVERYONE (mais VIEW) a quem está em allowed.
type fakeModerators struct {
	allowed map[string]bool // "channelID|userID"
	err     error
}

func (f fakeModerators) ChannelPerms(_ context.Context, channelID string, userID string) (int64, error) {
	if f.err != nil {
		return 0, f.err
	}
	perms := permission.ViewChannel
	if f.allowed[channelID+"|"+userID] {
		perms |= permission.MentionEveryone
	}
	return perms, nil
}

// everyoneOf: o mention_everyone que a mensagem (sem cargos pedidos) ganharia.
func everyoneOf(s *Service, ctx context.Context, serverID, channelID, authorID, content string) *string {
	return s.resolveMassMention(ctx, serverID, channelID, authorID, content, nil).Everyone
}

func TestResolveMentionEveryone(t *testing.T) {
	clock := &fakeClock{now: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)}
	newService := func(mods PermissionChecker) *Service {
		s := MessageService(nil, nil, nil, nil, nil, mods)
		s.mentionLimiter = newMentionLimiter(30*time.Second, clock.Now)
		return s
	}
	mods := fakeModerators{allowed: map[string]bool{"ch1|mod": true, "ch1|dono": true, "ch2|dono": true}}
	ctx := context.Background()

	t.Run("moderador ou dono marcam @all/@here", func(t *testing.T) {
		s := newService(mods)
		got := everyoneOf(s, ctx, "srv", "ch1", "mod", "@all bora")
		if got == nil || *got != MentionAll {
			t.Fatalf("got %v, want all", got)
		}
		got = everyoneOf(s, ctx, "srv", "ch1", "dono", "@here alguém?")
		if got == nil || *got != MentionHere {
			t.Fatalf("got %v, want here", got)
		}
	})

	t.Run("membro comum: texto puro, não pinga", func(t *testing.T) {
		s := newService(mods)
		if got := everyoneOf(s, ctx, "srv", "ch1", "membro", "@all bora"); got != nil {
			t.Fatalf("got %v, want nil", *got)
		}
	})

	t.Run("sem @all/@here não consulta nada", func(t *testing.T) {
		s := newService(fakeModerators{err: errors.New("não devia consultar")})
		if got := everyoneOf(s, ctx, "srv", "ch1", "mod", "oi @ana"); got != nil {
			t.Fatalf("got %v, want nil", *got)
		}
	})

	t.Run("erro ao checar cargo não pinga", func(t *testing.T) {
		s := newService(fakeModerators{allowed: mods.allowed, err: errors.New("db fora")})
		if got := everyoneOf(s, ctx, "srv", "ch1", "mod", "@all"); got != nil {
			t.Fatalf("got %v, want nil", *got)
		}
	})

	t.Run("sem servidor (DM) ou sem checador, não pinga", func(t *testing.T) {
		if got := everyoneOf(newService(mods), ctx, "", "ch1", "mod", "@all"); got != nil {
			t.Fatalf("got %v, want nil", *got)
		}
		if got := everyoneOf(newService(nil), ctx, "srv", "ch1", "mod", "@all"); got != nil {
			t.Fatalf("got %v, want nil", *got)
		}
	})

	t.Run("anti-spam: um @all/@here por autor por canal a cada 30s", func(t *testing.T) {
		s := newService(mods)
		if got := everyoneOf(s, ctx, "srv", "ch1", "mod", "@all"); got == nil {
			t.Fatal("first should ping")
		}
		clock.now = clock.now.Add(5 * time.Second)
		if got := everyoneOf(s, ctx, "srv", "ch1", "mod", "@here"); got != nil {
			t.Fatalf("second within 30s should not ping, got %v", *got)
		}
		// Membro comum tentando @all não gasta a vez de ninguém.
		everyoneOf(s, ctx, "srv", "ch2", "membro", "@all")
		if got := everyoneOf(s, ctx, "srv", "ch2", "dono", "@all"); got == nil {
			t.Fatal("other author in other channel should ping")
		}
		clock.now = clock.now.Add(30 * time.Second)
		if got := everyoneOf(s, ctx, "srv", "ch1", "mod", "@all"); got == nil {
			t.Fatal("after 30s should ping again")
		}
	})
}

func TestMentionLimiterReleaseGivesTheTurnBack(t *testing.T) {
	clock := &fakeClock{now: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)}
	limiter := newMentionLimiter(30*time.Second, clock.Now)

	if !limiter.Allow("ana", "ch1") {
		t.Fatal("first should be allowed")
	}
	limiter.Release("ana", "ch1")
	if !limiter.Allow("ana", "ch1") {
		t.Fatal("after release, should be allowed again")
	}
}
