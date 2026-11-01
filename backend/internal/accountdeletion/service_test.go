package accountdeletion

import (
	"context"
	"errors"
	"slices"
	"testing"
)

type fakeEraser struct {
	erasure *Erasure
	err     error
	called  string
}

func (f *fakeEraser) Erase(_ context.Context, userID string) (*Erasure, error) {
	f.called = userID
	return f.erasure, f.err
}

type fakeFiles struct {
	removed []string
	fail    bool
}

func (f *fakeFiles) Remove(name string) error {
	f.removed = append(f.removed, name)
	if f.fail {
		return errors.New("disco cheio")
	}
	return nil
}

func TestDeleteApagaArquivosDeCadaPastaEAvisaOsGanchos(t *testing.T) {
	repo := &fakeEraser{erasure: &Erasure{
		Files:          []File{{KindProfile, "a"}, {KindSticker, "s"}, {KindEmoji, "sem-pasta"}},
		DeletedServers: []string{"srv"},
	}}
	profile, static, stickers := &fakeFiles{}, &fakeFiles{fail: true}, &fakeFiles{}
	s := NewService(repo)
	s.SetFiles(KindProfile, profile, static)
	s.SetFiles(KindSticker, stickers)
	var hooked []string
	s.OnDeleted(func(userID string, e *Erasure) { hooked = append(hooked, userID+":"+e.DeletedServers[0]) })

	if err := s.Delete(context.Background(), "u1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	if repo.called != "u1" {
		t.Errorf("Erase chamado com %q", repo.called)
	}
	if !slices.Equal(profile.removed, []string{"a"}) || !slices.Equal(static.removed, []string{"a"}) {
		t.Errorf("perfil: %v / quadro parado: %v, quer [a] nas duas pastas (erro numa não para a outra)", profile.removed, static.removed)
	}
	if !slices.Equal(stickers.removed, []string{"s"}) {
		t.Errorf("figurinhas: %v", stickers.removed)
	}
	if !slices.Equal(hooked, []string{"u1:srv"}) {
		t.Errorf("ganchos: %v", hooked)
	}
}

func TestDeleteRecusadoNaoMexeEmArquivoNemAvisa(t *testing.T) {
	owns := &OwnsServersError{Servers: []OwnedServer{{ID: "s", Name: "Amigos"}}}
	files := &fakeFiles{}
	s := NewService(&fakeEraser{err: owns})
	s.SetFiles(KindProfile, files)
	s.OnDeleted(func(string, *Erasure) { t.Error("gancho chamado numa exclusão recusada") })

	err := s.Delete(context.Background(), "u1")

	if !errors.Is(err, ErrOwnsServers) {
		t.Fatalf("Delete = %v, quer ErrOwnsServers", err)
	}
	if len(files.removed) != 0 {
		t.Errorf("arquivos apagados: %v", files.removed)
	}
}
