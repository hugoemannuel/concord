package message

import (
	"errors"
	"testing"
)

type fakeRows struct {
	n   int
	err error
}

func (f *fakeRows) Next() bool { f.n--; return f.n >= 0 }

func (f *fakeRows) Scan(dest ...any) error {
	if f.err != nil {
		return f.err
	}
	if id, ok := dest[0].(*string); ok {
		*id = "m1"
	}
	return nil
}

func TestScanMessages_SemLinhasDevolveListaVazia(t *testing.T) {
	got, err := scanMessages(&fakeRows{})
	if err != nil || got == nil || len(got) != 0 {
		t.Fatalf("esperava lista vazia não nula, veio %v, %v", got, err)
	}
}

func TestScanMessages_LeTodasAsLinhas(t *testing.T) {
	got, err := scanMessages(&fakeRows{n: 2})
	if err != nil || len(got) != 2 || got[0].ID != "m1" {
		t.Fatalf("esperava 2 mensagens, veio %v, %v", got, err)
	}
}

func TestScanMessages_PropagaErroDoScan(t *testing.T) {
	if _, err := scanMessages(&fakeRows{n: 1, err: errors.New("x")}); err == nil {
		t.Fatal("esperava erro")
	}
}

func TestPopulateMedia_StickerEGif(t *testing.T) {
	id, srv, name, ct := "s1", "srv", "n", "image/png"
	msg := &Message{StickerID: &id}
	populateMedia(msg, &srv, &name, &ct, []byte(`{"width":10}`))
	if msg.Sticker == nil || msg.Sticker.ServerID != "srv" || msg.GifMetadata == nil {
		t.Fatalf("sticker e gif deviam vir preenchidos: %+v", msg)
	}
}

func TestPopulateMedia_IgnoraGifInvalidoESemSticker(t *testing.T) {
	msg := &Message{}
	populateMedia(msg, nil, nil, nil, []byte(`{ruim`))
	if msg.Sticker != nil || msg.GifMetadata != nil {
		t.Fatalf("nada deveria ser preenchido: %+v", msg)
	}
}

// lastBoolRow marca o último destino antes das colunas extras (embeds_suppressed).
type lastBoolRow struct{ extra int }

func (r lastBoolRow) Scan(dest ...any) error {
	b, ok := dest[len(dest)-1-r.extra].(*bool)
	if !ok {
		return errors.New("embeds_suppressed não é a última coluna de messageColumns")
	}
	*b = true
	return nil
}

func TestScanMessageRow_LeEmbedsSuppressed(t *testing.T) {
	msg, err := scanMessageRow(lastBoolRow{})
	if err != nil || !msg.EmbedsSuppressed {
		t.Fatalf("EmbedsSuppressed = %v, err = %v", msg.EmbedsSuppressed, err)
	}
	var extra string
	msg, err = scanMessageRow(lastBoolRow{extra: 1}, &extra)
	if err != nil || !msg.EmbedsSuppressed {
		t.Fatalf("com coluna extra: EmbedsSuppressed = %v, err = %v", msg.EmbedsSuppressed, err)
	}
}
