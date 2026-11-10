package castigo

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

func TestNeededEMaioria(t *testing.T) {
	for voters, want := range map[int]int{2: 2, 3: 2, 4: 3, 5: 3, 9: 5} {
		if got := needed(voters); got != want {
			t.Errorf("%d votantes: precisa de %d, quer %d", voters, got, want)
		}
	}
}

func TestStartVoteRegras(t *testing.T) {
	cases := []struct {
		name       string
		inCall     []string
		initiator  string
		target     string
		wantErr    error
		wantVoters int
	}{
		{"qualquer membro abre", []string{"ana", "bia", "caio"}, "ana", "caio", nil, 2},
		{"alvo não vota e não conta", []string{"ana", "bia", "caio", "duda"}, "bia", "ana", nil, 3},
		{"call de 2 não tem votação", []string{"ana", "bia"}, "ana", "bia", ErrFewVoters, 0},
		{"visitante não conta como votante", []string{"ana", "bia", "visita"}, "ana", "bia", ErrFewVoters, 0},
		{"visitante não abre", []string{"ana", "bia", "caio", "visita"}, "visita", "ana", ErrNotMember, 0},
		{"alvo fora da call", []string{"ana", "bia", "caio"}, "ana", "duda", ErrNotInCall, 0},
		{"quem abre fora da call", []string{"ana", "bia", "caio"}, "duda", "ana", ErrNotInCall, 0},
		{"o dono não vai a votação", []string{"ana", "bia", "dono"}, "ana", "dono", ErrOwner, 0},
		{"nem a si mesmo", []string{"ana", "bia", "caio"}, "ana", "ana", ErrSelf, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := newWorld(t)
			w.inCall(tc.inCall...)
			v, err := w.svc.StartVote(context.Background(), "c1", tc.initiator, speak5min(tc.target))
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v; quer %v", err, tc.wantErr)
			}
			if err == nil && (len(v.Voters) != tc.wantVoters || len(v.Yes) != 1 || v.Yes[0] != tc.initiator) {
				t.Errorf("votação = %+v", v)
			}
		})
	}
}

func TestVotacaoPassaComAMaioriaEAplicaOCastigo(t *testing.T) {
	w := newWorld(t)
	w.inCall("ana", "bia", "caio", "duda")
	ctx := context.Background()
	v, err := w.svc.StartVote(ctx, "c1", "ana", Request{UserID: "duda", Effects: Effects{Connect: true}, Duration: 600})
	if err != nil {
		t.Fatal(err)
	}
	if v.Needed != 2 || v.Status != VoteOpen || !v.ExpiresAt.Equal(w.now.Add(VoteWindow)) {
		t.Fatalf("votação = %+v", v)
	}
	if ev := w.last("castigo:vote"); ev.to != "call:c1" {
		t.Errorf("a call recebe a votação: %+v", ev)
	}
	if _, err := w.svc.CastVote(ctx, "c1", v.ID, "duda", false); !errors.Is(err, ErrNotVoter) {
		t.Errorf("o alvo não vota: %v", err)
	}
	if _, err := w.svc.CastVote(ctx, "c1", v.ID, "ana", true); !errors.Is(err, ErrAlreadyVoted) {
		t.Errorf("quem abriu já votou: %v", err)
	}
	if w.svc.Punished("duda") {
		t.Fatal("só um voto: ainda não vale")
	}
	v, err = w.svc.CastVote(ctx, "c1", v.ID, "bia", true)
	if err != nil || v.Status != VotePassed {
		t.Fatalf("2 de 3: passou? %+v, %v", v, err)
	}
	if !w.svc.Restriction("srv-1", "duda").NoConnect {
		t.Error("castigo aprovado vale")
	}
	e := w.audit.events[len(w.audit.events)-1]
	if e.ActorID != "ana" || e.ChannelID != "geral" || e.Changes[2].After != "vote" {
		t.Errorf("auditoria: quem abriu, onde e pela votação: %+v", e)
	}
	if _, err := w.svc.CastVote(ctx, "c1", v.ID, "caio", true); !errors.Is(err, ErrVoteNotFound) {
		t.Errorf("votação fechada: %v", err)
	}
}

func TestVotacaoFalhaQuandoOSimNaoChegaMais(t *testing.T) {
	w := newWorld(t)
	w.inCall("ana", "bia", "caio")
	ctx := context.Background()
	v, err := w.svc.StartVote(ctx, "c1", "ana", speak5min("caio"))
	if err != nil {
		t.Fatal(err)
	}
	v, err = w.svc.CastVote(ctx, "c1", v.ID, "bia", false)
	if err != nil || v.Status != VoteFailed {
		t.Fatalf("1 sim e 1 não de 2: falhou? %+v, %v", v, err)
	}
	if w.svc.Punished("caio") {
		t.Error("votação que falhou não castiga")
	}
}

func TestVotacaoUmaPorCallComEsperaEPrazo(t *testing.T) {
	w := newWorld(t)
	w.inCall("ana", "bia", "caio", "duda")
	ctx := context.Background()
	v, err := w.svc.StartVote(ctx, "c1", "ana", speak5min("caio"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.svc.StartVote(ctx, "c1", "bia", speak5min("duda")); !errors.Is(err, ErrVoteOpen) {
		t.Errorf("uma votação por vez na call: %v", err)
	}
	if cur, ok := w.svc.CurrentVote("c1", "bia"); !ok || cur.ID != v.ID {
		t.Error("quem está na call vê a votação aberta")
	}
	if _, ok := w.svc.CurrentVote("c1", "visita"); ok {
		t.Error("quem não está na call não vê")
	}

	w.now = w.now.Add(VoteWindow)
	if _, err := w.svc.CastVote(ctx, "c1", v.ID, "bia", true); !errors.Is(err, ErrVoteNotFound) {
		t.Errorf("fora do prazo não vota: %v", err)
	}
	w.svc.Sweep(ctx)
	var got Vote
	_ = json.Unmarshal(w.last("castigo:vote").payload, &got)
	if got.Status != VoteExpired || w.svc.Punished("caio") {
		t.Errorf("prazo acabou sem maioria: %+v", got)
	}
	if _, ok := w.svc.CurrentVote("c1", "bia"); ok {
		t.Error("votação vencida sai")
	}

}

func TestQuemAbreEsperaParaAbrirOutra(t *testing.T) {
	w := newWorld(t)
	w.inCall("ana", "bia", "caio")
	ctx := context.Background()
	v, err := w.svc.StartVote(ctx, "c1", "ana", speak5min("caio"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.svc.CastVote(ctx, "c1", v.ID, "bia", false); err != nil {
		t.Fatal(err)
	}
	w.now = w.now.Add(10 * time.Second)
	if _, err := w.svc.StartVote(ctx, "c1", "ana", speak5min("caio")); !errors.Is(err, ErrVoteCooldown) {
		t.Errorf("quem abriu espera para abrir outra: %v", err)
	}
	if _, err := w.svc.StartVote(ctx, "c1", "bia", speak5min("caio")); err != nil {
		t.Errorf("outra pessoa abre: %v", err)
	}
	w.now = w.now.Add(voteCooldown)
	w.svc.Sweep(ctx)
	if len(w.svc.votes.lastBy) != 0 {
		t.Errorf("a espera vencida sai da memória: %v", w.svc.votes.lastBy)
	}
}

func TestVotacaoAprovadaConfereOAlvoDeNovo(t *testing.T) {
	w := newWorld(t)
	w.inCall("ana", "bia", "caio")
	ctx := context.Background()
	v, err := w.svc.StartVote(ctx, "c1", "ana", speak5min("caio"))
	if err != nil {
		t.Fatal(err)
	}
	delete(w.svc.perms.(fakePerms).snap.MemberRoles, "caio") // saiu do servidor no meio
	if v, err = w.svc.CastVote(ctx, "c1", v.ID, "bia", true); err != nil || v.Status != VotePassed {
		t.Fatalf("%+v, %v", v, err)
	}
	if w.svc.Punished("caio") {
		t.Error("quem saiu do servidor não fica de castigo")
	}
}
