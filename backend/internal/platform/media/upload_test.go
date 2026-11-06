package media

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"syscall"
	"testing"
)

// askedRoom guarda quanto o upload pediu de espaço.
type askedRoom struct {
	room  bool
	asked int64
}

func (r *askedRoom) HasRoom(incoming int64) bool {
	r.asked = incoming
	return r.room
}

func multipartRequest(t *testing.T, file string) *http.Request {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, _ := mw.CreateFormFile("file", "a.bin")
	part.Write([]byte(file))
	mw.Close()
	r := httptest.NewRequest(http.MethodPost, "/", &body)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	return r
}

func TestOpenUploadSemEspacoNoDisco(t *testing.T) {
	r := multipartRequest(t, "abc")
	room := &askedRoom{}
	_, err := OpenUpload(httptest.NewRecorder(), r, room, UploadSpec{Limit: 1, Room: 99})
	if !errors.Is(err, syscall.ENOSPC) {
		t.Fatalf("err = %v; quer ENOSPC (o espaço vem antes do tamanho)", err)
	}
	if room.asked != r.ContentLength {
		t.Fatalf("pediu %d; quer o Content-Length %d", room.asked, r.ContentLength)
	}
}

func TestOpenUploadSemContentLengthReservaRoom(t *testing.T) {
	r := multipartRequest(t, "abc")
	r.ContentLength = -1
	room := &askedRoom{room: true}
	if _, err := OpenUpload(httptest.NewRecorder(), r, room, UploadSpec{Limit: 1 << 20, Room: 99}); err != nil {
		t.Fatal(err)
	}
	if room.asked != 99 {
		t.Fatalf("pediu %d; quer 99", room.asked)
	}
}

// SizeFirst e FixedRoom (emoji e banner do evento): o tamanho vem antes do
// espaço e o disco reserva sempre Room, mesmo com Content-Length.
func TestOpenUploadSizeFirstEFixedRoom(t *testing.T) {
	r := multipartRequest(t, "abc")
	spec := UploadSpec{Limit: r.ContentLength - 1, Room: 99, SizeFirst: true, FixedRoom: true}
	room := &askedRoom{}
	if _, err := OpenUpload(httptest.NewRecorder(), r, room, spec); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("err = %v; quer ErrTooLarge (o tamanho vem antes do espaço)", err)
	}
	spec.Limit = 1 << 20
	if _, err := OpenUpload(httptest.NewRecorder(), r, room, spec); !errors.Is(err, syscall.ENOSPC) {
		t.Fatalf("err = %v; quer ENOSPC", err)
	}
	if room.asked != 99 {
		t.Fatalf("pediu %d; quer o Room fixo 99", room.asked)
	}
}

func TestOpenUploadRecusaCorpoGrandeENaoMultipart(t *testing.T) {
	r := multipartRequest(t, "abc")
	if _, err := OpenUpload(httptest.NewRecorder(), r, fakeRoom(true), UploadSpec{Limit: r.ContentLength - 1}); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("err = %v; quer ErrTooLarge", err)
	}
	r = httptest.NewRequest(http.MethodPost, "/", strings.NewReader("{}"))
	r.Header.Set("Content-Type", "application/json")
	if _, err := OpenUpload(httptest.NewRecorder(), r, fakeRoom(true), UploadSpec{Limit: 1 << 20}); !errors.Is(err, ErrNotMultipart) {
		t.Fatalf("err = %v; quer ErrNotMultipart", err)
	}
}

// Com Cap, o corpo sem Content-Length também para no limite.
func TestOpenUploadCapCortaALeitura(t *testing.T) {
	for _, capped := range []bool{true, false} {
		t.Run(fmt.Sprint("cap=", capped), func(t *testing.T) {
			r := multipartRequest(t, strings.Repeat("x", 4096))
			r.ContentLength = -1
			reader, err := OpenUpload(httptest.NewRecorder(), r, fakeRoom(true), UploadSpec{Limit: 1024, Cap: capped})
			if err != nil {
				t.Fatal(err)
			}
			part, err := reader.NextPart()
			if err == nil {
				_, err = io.Copy(io.Discard, part)
			}
			var maxBytes *http.MaxBytesError
			if errors.As(err, &maxBytes) != capped {
				t.Fatalf("err = %v; cortou = %v, quer %v", err, !capped, capped)
			}
		})
	}
}

func TestUploadErrorsFor(t *testing.T) {
	answers := UploadErrors[string]{
		MissingFile: "missing", BadForm: "bad", NotMultipart: "not multipart", TooLarge: "large", NoSpace: "space",
	}
	cases := map[error]string{
		ErrMissingFile:                         "missing",
		fmt.Errorf("%w: eof", ErrBadForm):      "bad",
		ErrNotMultipart:                        "not multipart",
		ErrTooLarge:                            "large",
		&http.MaxBytesError{Limit: 1}:          "large",
		fmt.Errorf("save: %w", syscall.ENOSPC): "space",
	}
	for err, want := range cases {
		if got, ok := answers.For(err); !ok || got != want {
			t.Errorf("For(%v) = %q, %v; quer %q", err, got, ok, want)
		}
	}
	if got, ok := answers.For(errors.New("outro")); ok || got != "" {
		t.Errorf("erro desconhecido = %q, %v; quer vazio, false", got, ok)
	}
}
