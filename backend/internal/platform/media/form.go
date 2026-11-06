package media

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"slices"
)

var (
	// ErrBadForm: corpo multipart malformado ou com mais de um arquivo.
	ErrBadForm = errors.New("invalid upload")
	// ErrMissingFile: o upload não trouxe a parte "file".
	ErrMissingFile = errors.New("file is required")
)

// FormSpec diz como ler um upload multipart: onde salvar o arquivo, os
// limites e quais campos de texto guardar (os demais são descartados).
type FormSpec struct {
	ID       string
	MaxFile  int64
	MaxField int64
	Fields   []string
}

// Form é o que o upload trouxe: o arquivo já salvo no Store (tamanho, início
// para o Sniff, o Content-Type e o nome declarados) e os campos de texto pedidos.
type Form struct {
	Size     int64
	Head     []byte
	Declared string
	Filename string
	Fields   map[string]string
}

// ReadForm lê as partes do upload, salva a parte "file" em spec.ID e guarda
// os campos pedidos. Em qualquer erro não sobra arquivo salvo. Corpo acima do
// http.MaxBytesReader vira ErrTooLarge; multipart malformado, ErrBadForm.
func (s *Store) ReadForm(r *multipart.Reader, spec FormSpec) (Form, error) {
	form := Form{Fields: map[string]string{}}
	saved := false
	for {
		part, err := r.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			err = fmt.Errorf("%w: %w", ErrBadForm, err)
		} else {
			saved, err = s.readPart(part, spec, &form, saved)
			part.Close()
		}
		if err != nil {
			s.discard(spec.ID, saved)
			return Form{}, tooLargeOr(err)
		}
	}
	if !saved {
		return Form{}, ErrMissingFile
	}
	return form, nil
}

func (s *Store) readPart(part *multipart.Part, spec FormSpec, form *Form, saved bool) (bool, error) {
	name := part.FormName()
	switch {
	case name == "file" && saved:
		return saved, ErrBadForm
	case name == "file":
		form.Declared, form.Filename = part.Header.Get("Content-Type"), part.FileName()
		size, head, err := s.Save(spec.ID, part, spec.MaxFile)
		if errors.Is(err, io.ErrUnexpectedEOF) {
			return false, badForm(err)
		}
		if err != nil {
			return false, err
		}
		form.Size, form.Head = size, head
		return true, nil
	case slices.Contains(spec.Fields, name):
		raw, err := io.ReadAll(io.LimitReader(part, spec.MaxField))
		form.Fields[name] = string(raw)
		return saved, badForm(err)
	default:
		_, err := io.Copy(io.Discard, part)
		return saved, badForm(err)
	}
}

func (s *Store) discard(id string, saved bool) {
	if saved {
		_ = s.Remove(id)
	}
}

func badForm(err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%w: %w", ErrBadForm, err)
}

// tooLargeOr: estourar o http.MaxBytesReader é ErrTooLarge, como passar do
// limite do arquivo.
func tooLargeOr(err error) error {
	var maxBytes *http.MaxBytesError
	if errors.As(err, &maxBytes) {
		return ErrTooLarge
	}
	return err
}
