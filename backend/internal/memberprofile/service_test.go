package memberprofile

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/cosmetics"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/user"
)

// fakeStore guarda o perfil em memória, por (servidor, pessoa).
type fakeStore struct {
	rows    map[string]Overrides
	trash   []string
	global  *string
	nick    *string
	mutated int
}

func key(s, u string) string { return s + "/" + u }

func (f *fakeStore) Find(_ context.Context, s, u string) (Overrides, error) {
	return f.rows[key(s, u)], nil
}
func (f *fakeStore) Nickname(context.Context, string, string) (*string, error) { return f.nick, nil }
func (f *fakeStore) GlobalNameplate(context.Context, string) (*string, error)  { return f.global, nil }
func (f *fakeStore) Mutate(_ context.Context, s, u string, change func(*Overrides) error) error {
	o := f.rows[key(s, u)]
	if err := change(&o); err != nil {
		return err
	}
	f.mutated++
	if o.Empty() {
		delete(f.rows, key(s, u))
		return nil
	}
	f.rows[key(s, u)] = o
	return nil
}
func (f *fakeStore) Delete(_ context.Context, s, u string) error {
	o := f.rows[key(s, u)]
	if o.AvatarURL != nil {
		f.trash = append(f.trash, *o.AvatarURL)
	}
	delete(f.rows, key(s, u))
	return nil
}
func (f *fakeStore) TakeTrash(context.Context) ([]string, error) {
	out := f.trash
	f.trash = nil
	return out, nil
}

type fakePublisher struct{ events []string }

func (p *fakePublisher) PublishMemberProfile(_ context.Context, s, u string) {
	p.events = append(p.events, key(s, u))
}

type fakeMedia struct{ removed []string }

func (m *fakeMedia) RemoveMediaURL(url *string) {
	if url != nil {
		m.removed = append(m.removed, *url)
	}
}

type fakeSnapshots struct{ snap *permission.Snapshot }

func (f fakeSnapshots) Snapshot(context.Context, string) (*permission.Snapshot, error) {
	return f.snap, nil
}

type env struct {
	svc   *Service
	store *fakeStore
	pub   *fakePublisher
	media *fakeMedia
}

// ana é membro comum; bia não tem CHANGE_NICKNAME (cargo @everyone sem ela); zé não é membro.
func newEnv(everyone int64) env {
	snap := permission.NewSnapshot("s1", "dono", everyone).WithMember("dono").WithMember("ana")
	st := &fakeStore{rows: map[string]Overrides{}}
	pub := &fakePublisher{}
	media := &fakeMedia{}
	return env{NewService(st, fakeSnapshots{snap}, pub, media), st, pub, media}
}

func patchOf(t *testing.T, raw string) Patch {
	t.Helper()
	var p Patch
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		t.Fatal(err)
	}
	return p
}

// O PATCH tem três estados: ausente não mexe, null volta ao padrão, valor grava.
func TestUpdateHerdaSobrescreveEVolta(t *testing.T) {
	e := newEnv(permission.DefaultEveryone)
	ctx := context.Background()

	view, err := e.svc.Update(ctx, "s1", "ana", patchOf(t, `{"bio":"  oi  ","pronouns":"ela"}`))
	if err != nil {
		t.Fatal(err)
	}
	if !view.HasProfile || *view.Profile.Bio != "oi" || *view.Profile.Pronouns != "ela" {
		t.Fatalf("grava e arruma: %+v", view.Profile)
	}
	if view.Profile.StatusText != nil {
		t.Fatal("campo não enviado continua herdando")
	}

	view, err = e.svc.Update(ctx, "s1", "ana", patchOf(t, `{"bio":null}`))
	if err != nil {
		t.Fatal(err)
	}
	if view.Profile.Bio != nil || view.Profile.Pronouns == nil {
		t.Fatalf("null volta ao padrão só nesse campo: %+v", view.Profile)
	}

	view, err = e.svc.Update(ctx, "s1", "ana", patchOf(t, `{"pronouns":null}`))
	if err != nil {
		t.Fatal(err)
	}
	if view.HasProfile {
		t.Fatal("sem campo sobrando, o perfil do servidor deixa de existir")
	}
	if len(e.store.rows) != 0 {
		t.Fatalf("linha ficou: %v", e.store.rows)
	}
	if len(e.pub.events) != 3 {
		t.Fatalf("cada edição avisa o servidor: %v", e.pub.events)
	}
}

// Texto vazio é um valor: esconde o Sobre mim só neste servidor.
func TestTextoVazioSobrescreve(t *testing.T) {
	e := newEnv(permission.DefaultEveryone)
	view, err := e.svc.Update(context.Background(), "s1", "ana", patchOf(t, `{"bio":""}`))
	if err != nil {
		t.Fatal(err)
	}
	if !view.HasProfile || view.Profile.Bio == nil || *view.Profile.Bio != "" {
		t.Fatalf("vazio precisa ficar gravado: %+v", view.Profile)
	}
}

// Isolamento: o perfil de um servidor não vale em outro.
func TestIsolamentoEntreServidores(t *testing.T) {
	st := &fakeStore{rows: map[string]Overrides{}}
	snaps := map[string]*permission.Snapshot{
		"s1": permission.NewSnapshot("s1", "dono", permission.DefaultEveryone).WithMember("ana"),
		"s2": permission.NewSnapshot("s2", "dono", permission.DefaultEveryone).WithMember("ana"),
	}
	svc := NewService(st, perServer(snaps), nil, &fakeMedia{})
	ctx := context.Background()
	if _, err := svc.Update(ctx, "s1", "ana", patchOf(t, `{"bio":"no s1"}`)); err != nil {
		t.Fatal(err)
	}
	view, err := svc.View(ctx, "s2", "ana")
	if err != nil {
		t.Fatal(err)
	}
	if view.HasProfile || view.Profile.Bio != nil {
		t.Fatalf("vazou para o s2: %+v", view.Profile)
	}
}

type perServer map[string]*permission.Snapshot

func (p perServer) Snapshot(_ context.Context, id string) (*permission.Snapshot, error) {
	return p[id], nil
}

// Autorização: só membro; o perfil é sempre o próprio (o id vem da sessão).
func TestSoMembro(t *testing.T) {
	e := newEnv(permission.DefaultEveryone)
	ctx := context.Background()
	url := "/api/profile-media/x"
	checks := map[string]error{}
	_, checks["view"] = e.svc.View(ctx, "s1", "ze")
	_, checks["update"] = e.svc.Update(ctx, "s1", "ze", patchOf(t, `{"bio":"x"}`))
	_, _, checks["media"] = e.svc.SetMedia(ctx, "s1", "ze", MediaAvatar, &url)
	_, checks["delete"] = e.svc.Delete(ctx, "s1", "ze")
	checks["require"] = e.svc.RequireMember(ctx, "s1", "ze")
	for name, err := range checks {
		if !errors.Is(err, ErrNotMember) {
			t.Errorf("%s: esperava ErrNotMember, veio %v", name, err)
		}
	}
	if e.store.mutated != 0 || len(e.pub.events) != 0 {
		t.Fatal("quem não é membro não grava nem avisa")
	}
}

// CHANGE_NICKNAME só controla o nome: sem ela o resto do perfil funciona.
func TestSemChangeNicknameEditaORestoDoPerfil(t *testing.T) {
	e := newEnv(permission.DefaultEveryone &^ permission.ChangeNickname)
	view, err := e.svc.Update(context.Background(), "s1", "ana", patchOf(t, `{"bio":"oi"}`))
	if err != nil {
		t.Fatal(err)
	}
	if view.CanChangeNickname {
		t.Fatal("não pode trocar o apelido")
	}
	if view.Profile.Bio == nil {
		t.Fatal("o resto do perfil não depende de CHANGE_NICKNAME")
	}
}

func TestComChangeNicknameViewAvisa(t *testing.T) {
	e := newEnv(permission.DefaultEveryone)
	nick := "Aninha"
	e.store.nick = &nick
	view, err := e.svc.View(context.Background(), "s1", "ana")
	if err != nil {
		t.Fatal(err)
	}
	if !view.CanChangeNickname || view.Nickname == nil || *view.Nickname != nick {
		t.Fatalf("view: %+v", view)
	}
}

// As regras são as mesmas do perfil global.
func TestValidacoesIguaisAsDoGlobal(t *testing.T) {
	long := strings.Repeat("a", user.MaxBio+1)
	cases := map[string]string{
		"bio longa":   `{"bio":"` + long + `"}`,
		"pronomes":    `{"pronouns":"` + strings.Repeat("a", user.MaxPronouns+1) + `"}`,
		"nota":        `{"status_text":"` + strings.Repeat("a", user.MaxStatusText+1) + `"}`,
		"cor":         `{"banner_color":"azul"}`,
		"link":        `{"links":[{"url":"javascript:alert(1)"}]}`,
		"link demais": `{"links":[{"url":"https://a.co/1"},{"url":"https://a.co/2"},{"url":"https://a.co/3"},{"url":"https://a.co/4"},{"url":"https://a.co/5"},{"url":"https://a.co/6"}]}`,
		"estilo":      `{"name_style":{"font":"nao-existe","effect":"none","colors":[]}}`,
		"tema":        `{"profile_theme":{"border":"nao-existe","border_colors":[],"background":"default","background_colors":[],"effect":"none"}}`,
		"modo":        `{"nameplate_mode":"nao-existe"}`,
	}
	for name, raw := range cases {
		t.Run(name, func(t *testing.T) {
			e := newEnv(permission.DefaultEveryone)
			_, err := e.svc.Update(context.Background(), "s1", "ana", patchOf(t, raw))
			if !errors.Is(err, user.ErrInvalidProfile) {
				t.Fatalf("esperava perfil inválido, veio %v", err)
			}
			if e.store.mutated != 0 {
				t.Fatal("não pode gravar")
			}
		})
	}
}

func TestCorENomeArrumados(t *testing.T) {
	e := newEnv(permission.DefaultEveryone)
	view, err := e.svc.Update(context.Background(), "s1", "ana", patchOf(t, `{"banner_color":"#AABBCC","links":[{"url":" https://a.co "}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if *view.Profile.BannerColor != "#aabbcc" || (*view.Profile.Links)[0].URL != "https://a.co" {
		t.Fatalf("%+v", view.Profile)
	}
}

// Faixa "custom" exige imagem: a do servidor ou, herdando, a global.
func TestFaixaCustomExigeImagem(t *testing.T) {
	e := newEnv(permission.DefaultEveryone)
	ctx := context.Background()
	if _, err := e.svc.Update(ctx, "s1", "ana", patchOf(t, `{"nameplate_mode":"custom"}`)); !errors.Is(err, user.ErrInvalidProfile) {
		t.Fatalf("sem imagem: %v", err)
	}
	global := "/api/profile-media/global"
	e.store.global = &global
	if _, err := e.svc.Update(ctx, "s1", "ana", patchOf(t, `{"nameplate_mode":"custom"}`)); err != nil {
		t.Fatalf("herdando a global: %v", err)
	}
	e.store.global = nil
	url := "/api/profile-media/daqui"
	if _, _, err := e.svc.SetMedia(ctx, "s1", "ana", MediaNameplate, &url); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Update(ctx, "s1", "ana", patchOf(t, `{"nameplate_mode":"custom"}`)); err != nil {
		t.Fatalf("com a imagem do servidor: %v", err)
	}
}

func TestSetMedia(t *testing.T) {
	e := newEnv(permission.DefaultEveryone)
	ctx := context.Background()
	first, second := "/api/profile-media/1", "/api/profile-media/2"

	_, old, err := e.svc.SetMedia(ctx, "s1", "ana", MediaAvatar, &first)
	if err != nil || old != nil {
		t.Fatalf("primeira: %v %v", old, err)
	}
	view, old, err := e.svc.SetMedia(ctx, "s1", "ana", MediaAvatar, &second)
	if err != nil || old == nil || *old != first {
		t.Fatalf("troca devolve a antiga: %v %v", old, err)
	}
	if *view.Profile.AvatarURL != second {
		t.Fatalf("%+v", view.Profile)
	}
	view, old, err = e.svc.SetMedia(ctx, "s1", "ana", MediaAvatar, nil)
	if err != nil || *old != second || view.HasProfile {
		t.Fatalf("voltar ao padrão apaga o perfil vazio: %v %+v %v", old, view, err)
	}
}

func TestFaixaLigaEVoltaAHerdar(t *testing.T) {
	e := newEnv(permission.DefaultEveryone)
	ctx := context.Background()
	url := "/api/profile-media/f"
	view, _, err := e.svc.SetMedia(ctx, "s1", "ana", MediaNameplate, &url)
	if err != nil {
		t.Fatal(err)
	}
	if *view.Profile.NameplateMode != cosmetics.ModeCustom || *view.Profile.NameplateCustomURL != url {
		t.Fatalf("enviar liga a imagem própria: %+v", view.Profile)
	}
	view, _, err = e.svc.SetMedia(ctx, "s1", "ana", MediaNameplate, nil)
	if err != nil {
		t.Fatal(err)
	}
	if view.HasProfile {
		t.Fatalf("apagar a imagem em uso volta a herdar o modo: %+v", view.Profile)
	}
	// "off" escolhido à mão sobrevive a apagar a imagem.
	if _, err := e.svc.Update(ctx, "s1", "ana", patchOf(t, `{"nameplate_mode":"off"}`)); err != nil {
		t.Fatal(err)
	}
	view, _, err = e.svc.SetMedia(ctx, "s1", "ana", MediaNameplate, nil)
	if err != nil || *view.Profile.NameplateMode != cosmetics.ModeOff {
		t.Fatalf("%+v %v", view.Profile, err)
	}
}

// Apagar o perfil esvazia a caixa de saída dos arquivos.
func TestDeleteLimpaArquivos(t *testing.T) {
	e := newEnv(permission.DefaultEveryone)
	ctx := context.Background()
	url := "/api/profile-media/a"
	if _, _, err := e.svc.SetMedia(ctx, "s1", "ana", MediaAvatar, &url); err != nil {
		t.Fatal(err)
	}
	view, err := e.svc.Delete(ctx, "s1", "ana")
	if err != nil || view.HasProfile {
		t.Fatalf("%+v %v", view, err)
	}
	if len(e.media.removed) != 1 || e.media.removed[0] != url {
		t.Fatalf("arquivo: %v", e.media.removed)
	}
}

// A imagem própria da faixa só vai no JSON da própria pessoa.
func TestImagemPropriaSoNaVisaoDaPessoa(t *testing.T) {
	url := "/api/profile-media/f"
	o := Overrides{NameplateCustomURL: &url}
	public, _ := json.Marshal(o)
	if strings.Contains(string(public), "nameplate_custom_url") || strings.Contains(string(public), url) {
		t.Fatalf("vazou: %s", public)
	}
	self, _ := json.Marshal(SelfOverrides{Overrides: o, NameplateCustomURL: &url})
	if !strings.Contains(string(self), url) {
		t.Fatalf("a pessoa precisa ver: %s", self)
	}
}
