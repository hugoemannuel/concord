package proposal

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// uploadComment manda um anexo de comentário com os campos dados; data nil =
// sem a parte "file".
func uploadComment(t *testing.T, r *gin.Engine, fields map[string]string, name string, data []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	for k, v := range fields {
		w.WriteField(k, v)
	}
	if data != nil {
		part, _ := w.CreateFormFile("file", name)
		part.Write(data)
	}
	w.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/proposal-comment-media", &body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("X-User", "u1")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestUploadCommentMediaFicaPendente(t *testing.T) {
	r, st := newTestRouter(t)
	rec := uploadComment(t, r, map[string]string{"width": "640", "height": "0", "duration_ms": "x"}, `c:\fotos\a.png`, png1x1)
	if rec.Code != http.StatusCreated {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body)
	}
	var att CommentAttachment
	if err := json.Unmarshal(rec.Body.Bytes(), &att); err != nil {
		t.Fatal(err)
	}
	row := st.catt[att.ID].row
	if row.UploaderID != "u1" || row.Kind != "image" || row.ContentType != "image/png" || row.Filename != "a.png" ||
		row.SizeBytes != int64(len(png1x1)) || row.Width == nil || *row.Width != 640 || row.Height != nil || row.DurationMs != nil {
		t.Fatalf("anexo pendente = %+v", row)
	}
	get := httptest.NewRecorder()
	r.ServeHTTP(get, httptest.NewRequest(http.MethodGet, att.URL, nil))
	if get.Code != http.StatusOK || !bytes.Equal(get.Body.Bytes(), png1x1) {
		t.Fatalf("servir: %d", get.Code)
	}
}

func TestUploadCommentMediaRecusas(t *testing.T) {
	casos := map[string]struct {
		data     []byte
		status   int
		resposta string
	}{
		"tipo desconhecido": {[]byte("\x00\x01\x02 binário qualquer"), http.StatusUnsupportedMediaType, `{"error":"unsupported file type"}`},
		"sem arquivo":       {nil, http.StatusBadRequest, `{"error":"invalid upload"}`},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			r, st := newTestRouter(t)
			rec := uploadComment(t, r, nil, "a.bin", caso.data)
			if rec.Code != caso.status || rec.Body.String() != caso.resposta {
				t.Fatalf("resposta = %d %s", rec.Code, rec.Body)
			}
			if len(st.catt) != 0 {
				t.Fatalf("upload recusado ficou no banco: %v", st.catt)
			}
		})
	}
}

func TestUploadRecusaCorpoQueNaoEMultipart(t *testing.T) {
	r, _ := newTestRouter(t)
	for _, path := range []string{"/api/proposal-media", "/api/proposal-comment-media"} {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader("{}"))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-User", "u1")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest || rec.Body.String() != `{"error":"invalid upload"}` {
			t.Fatalf("%s: %d %s", path, rec.Code, rec.Body)
		}
	}
}
