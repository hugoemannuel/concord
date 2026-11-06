package media

import (
	"bytes"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const formID = "11111111-1111-1111-1111-111111111111"

type formPart struct{ name, value string }

func formReader(t *testing.T, parts ...formPart) *multipart.Reader {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for _, p := range parts {
		if p.name == "file" {
			fw, err := w.CreateFormFile("file", "a.bin")
			if err != nil {
				t.Fatal(err)
			}
			fw.Write([]byte(p.value))
			continue
		}
		w.WriteField(p.name, p.value)
	}
	w.Close()
	return multipart.NewReader(&buf, w.Boundary())
}

func newFormStore(t *testing.T) (*Store, string) {
	t.Helper()
	dir := t.TempDir()
	s, err := NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	return s, dir
}

func spec(fields ...string) FormSpec {
	return FormSpec{ID: formID, MaxFile: 16, MaxField: 4, Fields: fields}
}

func TestReadFormSavesFileAndWantedFields(t *testing.T) {
	s, dir := newFormStore(t)
	r := formReader(t, formPart{"name", "buzina"}, formPart{"extra", "x"}, formPart{"file", "abc"})
	form, err := s.ReadForm(r, spec("name"))
	if err != nil {
		t.Fatal(err)
	}
	if form.Size != 3 || string(form.Head) != "abc" || form.Declared != "application/octet-stream" || form.Filename != "a.bin" {
		t.Errorf("form = %+v", form)
	}
	// Campo cortado em MaxField; campo não pedido some.
	if form.Fields["name"] != "buzi" || len(form.Fields) != 1 {
		t.Errorf("fields = %v", form.Fields)
	}
	if _, err := os.Stat(filepath.Join(dir, formID)); err != nil {
		t.Errorf("arquivo não foi salvo: %v", err)
	}
}

func TestReadFormWithoutFile(t *testing.T) {
	s, _ := newFormStore(t)
	_, err := s.ReadForm(formReader(t, formPart{"name", "a"}), spec("name"))
	if !errors.Is(err, ErrMissingFile) {
		t.Errorf("err = %v, want ErrMissingFile", err)
	}
}

func TestReadFormErrorsLeaveNoFile(t *testing.T) {
	cases := map[string]struct {
		parts []formPart
		want  error
	}{
		"dois arquivos":   {[]formPart{{"file", "a"}, {"file", "b"}}, ErrBadForm},
		"arquivo grande":  {[]formPart{{"file", strings.Repeat("x", 17)}}, ErrTooLarge},
		"campo depois ok": {[]formPart{{"file", "a"}, {"file", strings.Repeat("x", 17)}}, ErrBadForm},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			s, dir := newFormStore(t)
			_, err := s.ReadForm(formReader(t, tc.parts...), spec())
			if !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
			if entries, _ := os.ReadDir(dir); len(entries) != 0 {
				t.Errorf("sobrou arquivo: %v", entries)
			}
		})
	}
}

func TestReadFormMalformedAndMaxBytes(t *testing.T) {
	s, _ := newFormStore(t)
	for name, raw := range map[string]string{
		"cabeçalho": "--fronteira\r\nsem-dois-pontos\r\n\r\n",
		"cortado":   "--fronteira\r\nContent-Disposition: form-data; name=\"file\"\r\n\r\nabc",
	} {
		bad := multipart.NewReader(strings.NewReader(raw), "fronteira")
		if _, err := s.ReadForm(bad, spec()); !errors.Is(err, ErrBadForm) {
			t.Errorf("%s: err = %v, want ErrBadForm", name, err)
		}
	}

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	fw, _ := w.CreateFormFile("file", "a.bin")
	fw.Write(bytes.Repeat([]byte("x"), 1000))
	w.Close()
	body := http.MaxBytesReader(httptest.NewRecorder(), io.NopCloser(&buf), 300)
	big := spec()
	big.MaxFile = 5000
	if _, err := s.ReadForm(multipart.NewReader(body, w.Boundary()), big); !errors.Is(err, ErrTooLarge) {
		t.Errorf("corpo grande: err = %v, want ErrTooLarge", err)
	}
}
