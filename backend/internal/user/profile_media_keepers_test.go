package user

import (
	"context"
	"errors"
	"testing"
)

type keeperFunc func(url string) (bool, error)

func (f keeperFunc) MediaInUse(_ context.Context, url string) (bool, error) { return f(url) }

func TestMediaKeepers(t *testing.T) {
	free := keeperFunc(func(string) (bool, error) { return false, nil })
	used := keeperFunc(func(string) (bool, error) { return true, nil })
	boom := errors.New("banco fora")
	broken := keeperFunc(func(string) (bool, error) { return false, boom })

	if got, err := (MediaKeepers{free, free}).MediaInUse(context.Background(), "u"); got || err != nil {
		t.Fatalf("ninguém usa: %v %v", got, err)
	}
	if got, err := (MediaKeepers{free, used}).MediaInUse(context.Background(), "u"); !got || err != nil {
		t.Fatalf("um usa: %v %v", got, err)
	}
	if _, err := (MediaKeepers{broken, used}).MediaInUse(context.Background(), "u"); !errors.Is(err, boom) {
		t.Fatalf("erro precisa subir (na dúvida o arquivo fica): %v", err)
	}
}
